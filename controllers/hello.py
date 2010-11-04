import os
import re
import time
import urllib
import string
import random as rand
import simplejson
import unicodedata
import htmlentitydefs

from datetime import datetime, timedelta

import logging

from sqlalchemy.sql.functions import random
from sqlalchemy.orm import contains_eager

from pylons import request, response, session, tmpl_context as c

from scatterbrainz.lib.base import BaseController, render

from scatterbrainz.external.my_MB import getRelease, searchRelease

log = logging.getLogger(__name__)

from scatterbrainz.model.meta import Session
from scatterbrainz.model.track import Track
from scatterbrainz.model.artist import Artist
from scatterbrainz.model.album import Album

from scatterbrainz.config.config import Config

from scatterbrainz.services import albumart
from scatterbrainz.lib import pylast

from repoze.what.predicates import has_permission
from repoze.what.plugins.pylonshq import ControllerProtector

@ControllerProtector(has_permission('login'))
class HelloController(BaseController):

    lastfmNetwork = pylast.get_lastfm_network(api_key = Config.LAST_FM_API_KEY,
                                              api_secret = Config.LAST_FM_API_SECRET,
                                              username = Config.LAST_FM_USER,
                                              password_hash = pylast.md5(Config.LAST_FM_PASSWORD))
    scrobbler = lastfmNetwork.get_scrobbler('tst',1.0)
    lastfmNetwork.enable_caching()
    
    def index(self):
        c.username = request.environ['repoze.what.credentials']['repoze.what.userid']
        return render('/hello.html')

    def treeBrowseAJAX(self):
        idStr = request.params['id']
        if idStr == 'init':
            return self._allArtistsTreeJSON()
        else:
            [type, id] = idStr.split('/',1)
            if type == 'Artist':
                return self._albumsForArtistTreeJSON(id)
            elif type == 'Album':
                return self._tracksForAlbumTreeJSON(id)
            else:
                raise Exception('bad type '+type)
    
    def _allArtistsTreeJSON(self):
        artists = Session.query(Artist).join(Album)
        return self._dumpFlatJSON(artists, self._compareTreeFloatVA)
    
    def _albumsForArtistTreeJSON(self, artistid):
        albums = Session.query(Album).join(Artist).filter_by(id=artistid)
        return self._dumpFlatJSON(albums)
    
    def _tracksForAlbumTreeJSON(self, albumid):
        tracks = Session.query(Track).filter_by(albumid=albumid).order_by(Track.filepath)
        return self._dumpFlatJSON(tracks, None)
    
    def _dumpFlatJSON(self, results, sortfun=cmp):
        json = map(lambda x: x.toTreeJSON(), results)
        if sortfun:
            json.sort(sortfun)
        return simplejson.dumps(json)
    
    def getTracksAJAX(self):
        idStr = request.params['id']
        [type, id] = idStr.split('/',1)
        if type == 'Track':
            return self._trackPlaylistJSON(id)
        elif type == 'Artist':
            return self._tracksForArtistPlaylistJSON(id)
        elif type == 'Album':
            return self._tracksForAlbumPlaylistJSON(id)
        else:
            raise Exception('bad type '+type)
    
    def randomTrackAJAX(self):
        track = Session.query(Track).order_by(random())[0]
        return simplejson.dumps([track.toPlaylistJSON()])
    
    def randomAlbumAJAX(self):
        album = Session.query(Album).order_by(random())[0]
        tracks = Session.query(Track) \
                        .filter_by(albumid=album.id)
        json = map(lambda x: x.toPlaylistJSON(), tracks)
        return simplejson.dumps(json)
    
    def similarTrackAJAX(self):
        id = request.params['id'].split('_')[1]
        track = Session.query(Track).filter_by(id=id).one()
        lastfmArtist = self.lastfmNetwork.get_artist(track.artist.name)
        similarArtists = lastfmArtist.get_similar()
        similarMbids = filter(lambda x: x is not None, map(lambda x: x.mbid, similarArtists))
        randomSimilarArtist = Session.query(Artist).filter(Artist.mbid.in_(similarMbids)).order_by(random()).first()
        randomTrack = rand.choice(randomSimilarArtist.tracks)
        return simplejson.dumps([randomTrack.toPlaylistJSON()])
    
    def _trackPlaylistJSON(self, trackid):
        tracks = Session.query(Track).filter_by(id=trackid).order_by(Track.filepath)
        return self._playlistJSON(tracks)
    
    def _tracksForAlbumPlaylistJSON(self, albumid):
        tracks = Session.query(Track).filter_by(albumid=albumid).order_by(Track.filepath)
        return self._playlistJSON(tracks)
    
    def _tracksForArtistPlaylistJSON(self, artistid):
        tracks = Session.query(Track).filter_by(artistid=artistid).order_by(Track.filepath)
        return self._playlistJSON(tracks)

    def _playlistJSON(self, tracks):
        json = map(lambda x: x.toPlaylistJSON(), tracks)
        return simplejson.dumps(json)
    
    def searchAJAX(self):
        search = request.params['search']
        maxResults = 50
        artists = Session.query(Artist). \
                          filter(Artist.name.ilike('%'+search+'%')) \
                          [0:maxResults]
        albums = Session.query(Album). \
                         filter(Album.name.ilike('%'+search+'%')) \
                         [0:maxResults]
        tracks = Session.query(Track). \
                         filter(Track.id3title.ilike('%'+search+'%')) \
                         [0:maxResults]
        if len(artists) == maxResults or len(tracks) == maxResults or len(albums) == maxResults:
            truncated = True
        else:
            truncated = False
        artistIdToJSON = {}
        albumsIdToJSON = {}
        for artist in artists:
            if artist.id not in artistIdToJSON:
                artistJSON = artist.toTreeJSON()
                artistIdToJSON[artist.id] = artistJSON
        for album in albums:
            if album.artist:
                if album.artist.id not in artistIdToJSON:
                    artistJSON = album.artist.toTreeJSON(children=[])
                    artistIdToJSON[album.artist.id] = artistJSON
                    albumJSON = album.toTreeJSON()
                    artistJSON['children'].append(albumJSON)
                    albumsIdToJSON[album.id] = albumJSON
                elif 'children' in artistIdToJSON[album.artist.id]:
                    albumJSON = album.toTreeJSON()
                    artistIdToJSON[album.artist.id]['children'].append(albumJSON)
                    albumsIdToJSON[album.id] = albumJSON
                else:
                    continue
        for track in tracks:
            if track.album and track.album.artist:
                if track.album.artist.id not in artistIdToJSON:
                    # artist not yet in search results, add artist, album, track
                    artistJSON = track.album.artist.toTreeJSON(children=[])
                    artistIdToJSON[track.album.artist.id] = artistJSON
                    albumJSON = track.album.toTreeJSON(children=[])
                    albumsIdToJSON[track.album.id] = albumJSON
                    artistJSON['children'].append(albumJSON)
                    albumJSON['children'].append(track.toTreeJSON())
                else:
                    if 'children' in artistIdToJSON[track.album.artist.id]:
                        if track.album.id not in albumsIdToJSON:
                            # album not yet in search results, add album, track
                            albumJSON = track.album.toTreeJSON(children=[])
                            albumsIdToJSON[track.album.id] = albumJSON
                            artistIdToJSON[track.album.artist.id]['children'].append(albumJSON)
                            albumJSON['children'].append(track.toTreeJSON())
                        else:
                            if 'children' in albumsIdToJSON[track.album.id]:
                                # other tracks on this album in search results
                                albumsIdToJSON[track.album.id]['children'].append(track.toTreeJSON())
                            else:
                                # album itself matched search results, don't add child tracks
                                continue
                    else:
                        # artist itself matched search results, don't add child tracks
                        continue
        json = artistIdToJSON.values()
        json.sort(self._compareTreeFloatVA)
        return simplejson.dumps(json)

    def _compareTreeFloatVA(self, a, b):
        if a['data'] == 'Various Artists':
            return -1
        elif b['data'] == 'Various Artists':
            return 1
        else:
            return cmp(a['data'], b['data'])
    
    def debug(self):
        raise Exception
    
    def clearAlbumArt(self):
        id = request.params['id']
        Session.begin()
        album = Session.query(Album).filter_by(id=id).one()
        album.albumArtFilename = None
        album.lastHitAlbumArtExchange = None
        Session.commit()
        return 'Cleared album art for ' + album.artist.name + ' - ' + album.name
    
    def setAlbumArt(self):
        id = request.params['id']
        url = request.params['url']
        Session.begin()
        album = Session.query(Album).filter_by(id=id).one()
        album.albumArtFilename = albumart._fetchAlbumArt(album.artist.name, album.name, url)
        Session.commit()
        return 'Set album art for ' + album.artist.name + ' - ' + album.name + ' to ' + url + ', saved to ' + album.albumArtFilename

    def getAlbumArtAJAX(self):
        trackid = request.params['trackid'].split('_')[1]
        track = Session.query(Track).filter_by(id=trackid).one()
        albumartfilename = albumart.get_art(Session, track.album)
        json = {}
        if albumartfilename is not None:
            json['albumArtURL'] = albumartfilename
        return simplejson.dumps(json)

    def getLyricsAJAX(self):
        trackid = request.params['trackid'].split('_')[1]
        track = Session.query(Track).filter_by(id=trackid).one()
        if not track.lyrics and \
           (track.lastHitLyricWiki is None or \
            datetime.now() > track.lastHitLyricWiki + timedelta(days=10)):
            
            track.lastHitLyricWiki = datetime.now()
            title = track.id3title
            artist = track.id3artist

            def getLyricsHtml(encoder = lambda s: s):
                params = {
                    'artist' : encoder(artist),
                    'song'   : encoder(title),
                    'fmt'    : 'json',
                }
                url = 'http://lyrics.wikia.com/api.php?%s' % urllib.urlencode(params)
                log.info('[lyric] Hitting ' + url)
                html = urllib.urlopen(url).read()
                return html if not "'lyrics':'Not found'" in html else None

            try:
                html = getLyricsHtml()
            except UnicodeEncodeError:
                html = getLyricsHtml(lambda s: s.encode('utf-8')) or \
                       getLyricsHtml(lambda s: unicodedata.normalize('NFKD', s).encode('ascii', 'ignore'))
                # wikia keys some int'l lyrics on correctly-encoded titles
                # and others on normalized (e.g., "el nino") titles

            if html:
                search = re.search("'url':'(?P<url>.*?)'",html)
                lyricurl = urllib.unquote(search.group('url'))
                page = urllib.quote(lyricurl.split('/')[-1])
                lyricurl = 'http://lyrics.wikia.com/index.php?title='+page+'&action=edit'
                log.info('[lyric] Hitting ' + lyricurl)
                lyrichtml = urllib.urlopen(lyricurl).read()
                lyricREstr = "&lt;lyrics&gt;(?P<lyrics>.*)&lt;/lyrics&gt;"
                lyricRE = re.search(lyricREstr, lyrichtml, re.S)
                if lyricRE:
                    lyrics = lyricRE.group('lyrics').strip('\n')
                    if '{{gracenote_takedown}}' in lyrics:
                        historyurl = 'http://lyrics.wikia.com/index.php?title='+page+'&action=history'
                        log.info('[lyric] Found gracenote takedown, hitting ' + historyurl)
                        historyhtml = urllib.urlopen(historyurl).read()
                        oldidRE = re.search(".*GracenoteBot.*?/index\.php\?title=.*?&amp;oldid=(?P<oldid>\d+)", historyhtml, re.S)
                        if oldidRE:
                            oldid = oldidRE.group('oldid')
                            oldlyricsurl = lyricurl + '&oldid=' + oldid
                            log.info('[lyric] found pre-takedown lyrics! hitting ' + oldlyricsurl)
                            oldlyrichtml = urllib.urlopen(oldlyricsurl).read()
                            lyricRE = re.search(lyricREstr, oldlyrichtml, re.S)
                            if lyricRE:
                                lyrics = lyricRE.group('lyrics').strip('\n')
                                if '{{gracenote_takedown}}' in lyrics:
                                    raise Exception('[lyric] Still found takedown lyrics!')
                                elif '{{Instrumental}}' in lyrics:
                                    track.lyrics = u'(Instrumental)'
                                else:
                                    track.lyrics = lyrics.replace('\n','<br />').decode('utf-8')
                            else:
                                log.info('[lyric] failed lyrics!')
                                raise Exception('failed lyrics!')
                        else:
                            log.info('[lyric] no pre-takedown lyrics found :(')
                    elif '{{Instrumental}}' in lyrics:
                        track.lyrics = u'(Instrumental)'
                    else:
                        track.lyrics = lyrics.replace('\n','<br />').decode('utf-8')
                else:
                    log.info('[lyric] failed lyrics!')
                    raise Exception('failed lyrics!')
            else:
                log.info('[lyric] No results found')
            Session.begin()
            Session.commit()
        json = {}
        if track.lyrics:
            json['lyrics'] = track.lyrics
        return simplejson.dumps(json)
    
    def getTrackInfoAJAX(self):
        trackid = request.params['trackid'].split('_')[1]
        track = Session.query(Track).filter_by(id=trackid).one()
        (artistName, albumName, trackName) = (track.id3artist, track.id3album, track.id3title)
        log.info(request.remote_addr + ' playing ' + artistName + ' - ' + trackName)
        if (not track.artist.mbid or not track.album.mbid or not track.album.asin) and \
           (track.album.lastHitMusicbrainz is None \
             or datetime.now() > track.album.lastHitMusicbrainz + timedelta(days=10)):

            track.album.lastHitMusicbrainz = datetime.now()
            
            album = track.album
            artist = album.artist
            release = None
            if album.mbid:
                release = getRelease(album.mbid)
            else:
                if artist.name == 'Various Artists':
                    release = searchRelease(None, album.name)
                else:
                    if artist.name.startswith('The') or artist.name.startswith('the') or artist.name.startswith('THE'):
                        artistSearch = artist.name[4:]
                    else:
                        artistSearch = artist.name
                    release = searchRelease(artistSearch, album.name)
                if release and not album.mbid:
                    album.mbid = release.id.split('/')[-1]
                if release and not artist.mbid:
                    artist.mbid = release.artist.id.split('/')[-1]
            if release:
                albumName = release.title
                asin = release.getAsin()
                if asin:
                    track.album.asin = asin
                if release.artist:
                    artistName = release.artist.name
            Session.begin()
            Session.commit()
        json = {}
        json['artist'] = artistName
        json['album'] = albumName
        json['track'] = trackName
        if track.album.asin:
            json['asin'] = track.album.asin
        return simplejson.dumps(json)
    
    def scrobbleTrackAJAX(self):
        trackid = request.params['id'].split('_')[1]
        track = Session.query(Track).filter_by(id=trackid).one()
        if track.mp3length >= 30:
            self.scrobbler.scrobble(track.id3artist, track.id3title, int(time.time()) - track.mp3length, pylast.SCROBBLE_SOURCE_USER, pylast.SCROBBLE_MODE_PLAYED, track.mp3length, track.id3album, track.getTrackNum())

    def getArtistInfoAJAX(self):
        trackid = request.params['trackid'].split('_')[1]
        track = Session.query(Track).filter_by(id=trackid).one()
        artist = self.lastfmNetwork.get_artist(track.artist.name)
        return simplejson.dumps({
            'bio'    : artist.get_bio_content(),
            'images' : map(lambda i:[i.sizes.largesquare, i.sizes.original], artist.get_images(limit=20))
        })

