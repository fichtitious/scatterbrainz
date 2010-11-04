$(document).ready(function(){

    $.ajaxSetup({ cache: false });

    /**
        * tablesorter and jquery UI sortable BS
        */

    $('#playlist').tablesorter();
    $('#playlistbody').sortable({ axis: 'y', opacity: 0.6,
        containment: 'parent',
        items: 'tr',
        placeholder: 'placeholder',
        distance: 15,
        tolerance: 'pointer'
    });
    $(".jp-playlist").droppable({
        drop: function(event, ui) {
            var browsenode = ui.draggable;
            if (browsenode.hasClass('browsenode')) {
                addToPlaylist(browsenode.attr('id'), event.originalEvent.target);
            } else {
                return;
            }
        }
    });
    $('#browser').tree({
        data : { 
            async : true,
            type : 'json',
            opts : {
                url : '/hello/treeBrowseAJAX'
            }
        },
        callback : { 
            beforedata : function (n, t) {
                return { id : $(n).attr("id") || 'init' };
            }
        },
        ui : {
            theme_name : 'default'
        },
        plugins : {
            hotkeys : { }
        },
        types : {
            'default' : {
                clickable	: true,
                renameable	: false,
                deletable	: false,
                creatable	: false,
                draggable	: false,
                max_children	: -1,
                max_depth	: -1,
                valid_children	: 'all',
                icon : {
                    image : false,
                    position : false
                }
            },
            'Artist': {
                icon: {
                    image: '/static/icons/artist.gif'
                }
            },
            'Album': {
                icon: {
                    image: '/static/icons/cd2small.gif'
                }
            },
            'Track': {
                icon: {
                    image: '/static/icons/note2small.jpg'
                }
            }
        }
    });

    /**
        * make browser nodes draggable w/ jquery ui live shit
        */
    $('li.browsenode').live("mouseover", function() {
        node = $(this);
        if (!node.data("init")) {
            node.data("init", true);
            node.draggable({
                opacity: 0.7,
                appendTo: '#playlistbody',
                cursorAt: {left: -1, top: -1},
                helper: function(event) {
                    return $('<span>' + event.target.text + '</span>');
                },
                distance: 15
            });
        }
    });
    
    $('li.browsenode[rel=Track]').live('dblclick', function () {
        var self = $(this);
        addToPlaylist(self.attr('id'));
    });

    /**
        * jplayer playlist BS
        */

    lyricsWidget.init();
    var global_lp = 0;
    $("#jquery_jplayer")
    .jPlayer( {
        ready: function () {
            $('.song').live('dblclick', play);
        }
    })
    .jPlayer("onSoundComplete", playListNextAndScrobble)
    .jPlayer("onProgressChange", function(lp,ppr,ppa,pt,tt) {
        var lpInt = parseInt(lp);
        var ppaInt = parseInt(ppa);
        global_lp = lpInt;
        lyricsWidget.updateFromPlayer(parseInt(pt));

        $('#loaderBar').progressbar('option', 'value', lpInt);
        $('#sliderPlayback').slider('option', 'value', ppaInt);

        //jpPlayTime.text($.jPlayer.convertTime(playedTime));
        //jpTotalTime.text($.jPlayer.convertTime(totalTime));

    });
    
    audio = $('#jquery_jplayer').data('jPlayer.config').audio;

    $("#prev").click(playListPrev);
    $("#next").click(playListNext);
    $("#play").click(function() {
        $('#play').hide();
        $('#pause').show();
        $("#jquery_jplayer").jPlayer("play");
    });
    $("#pause").click(function() {
        $('#play').show();
        $('#pause').hide();
        $("#jquery_jplayer").jPlayer("pause");
    });

    $("#volume-min").click( function() {
        audio.muted = false;
        $("#volume-max").toggle();
        $("#volume-min").toggle();
    });

    $("#volume-max").click( function() {
        audio.muted = true;
        $("#volume-max").toggle();
        $("#volume-min").toggle();
    });

    $("#player_progress_ctrl_bar a").live( "click", function() {
        $("#jquery_jplayer").jPlayer("playHead", this.id.substring(3)*(100.0/global_lp));
        return false;
    });

    // Slider
    $('#sliderPlayback').slider({
        max: 100,
        range: 'min',
        animate: true,
        slide: function(event, ui) {
            $("#jquery_jplayer").jPlayer("playHead", ui.value*(100.0/global_lp));
        }
    });

    $('#sliderVolume').slider({
        value : 80,
        max: 100,
        range: 'min',
        animate: true,
        slide: function(event, ui) {
            $("#jquery_jplayer").jPlayer("volume", ui.value);
        }
    });

    $('#loaderBar').progressbar();


    //hover states on the static widgets
    $('#dialog_link, ul#icons li').hover(
        function() { $(this).addClass('ui-state-hover'); },
        function() { $(this).removeClass('ui-state-hover'); }
    );

    /**
        * Playlist interaction, shift click, ctrl click, del, etc
        */
    $('.song').live('click', function(e) {
        $('.jp-playlist').focus();
        var self = $(this);
        var lastselected = $('.lastSelected');
        if (lastselected.length > 0) {
            if (e.shiftKey) {
                if (self.prevAll('.lastSelected').length > 0) {
                    self.prevUntil('.lastSelected').addClass('selected');
                } else {
                    self.nextUntil('.lastSelected').addClass('selected');
                }
                $('.lastSelected').removeClass('lastSelected');
                self.addClass('selected').addClass('lastSelected');
                return true;
            } else if (e.ctrlKey) {
                self.toggleClass('selected').addClass('lastSelected');
                return true;
            }
        }
        $('.selected').removeClass('selected');
        $('.lastSelected').removeClass('lastSelected');
        self.addClass('selected').addClass('lastSelected');
        return true;
    });

    $('.jp-playlist').bind('keydown', 'ctrl+a', function() {
        $('.song').addClass('selected');
        return false;
    });

    $('.jp-playlist').bind('keydown', 'del', function() {
        var next = $('.selected:last').next('tr');
        var prev = $('.selected:first').prev('tr');
        $('.selected').remove();
        if (next.length) {
            next.addClass('selected').addClass('lastSelected');
        } else if (prev.length) {
            prev.addClass('selected').addClass('lastSelected');
        }
        return false;
    });

    $('.jp-playlist').bind('keydown', 'down', function() {

        var next = $('.lastSelected').next();
        if (next.length > 0) {
            $('.selected').removeClass('selected').removeClass('lastSelected');
        next.addClass('selected').addClass('lastSelected');
        scrollTo(next, $('.jp-playlist'));
        }

        return false;
    });

    $('.jp-playlist').bind('keydown', 'up', function() {
        var prev = $('.lastSelected').prev();
        if (prev.length > 0) {
            $('.selected').removeClass('selected').removeClass('lastSelected');
            prev.addClass('selected').addClass('lastSelected');
            scrollTo(prev, $('.jp-playlist'));
        }
        return false;
    });

    /**
        * Dispatch clicks to fake floating table header over to real table header
        */
    $('#playlistHeadTable th.artist').click(function() {
        $('#playlist th.artist').click();
    });
    $('#playlistHeadTable th.title').click(function() {
        $('#playlist th.title').click();
    });
    $('#playlistHeadTable th.album').click(function() {
        $('#playlist th.album').click();
    });
    $('#playlistHeadTable th.tracknum').click(function() {
        $('#playlist th.tracknum').click();
    });
    $('#playlistHeadTable th.length').click(function() {
        $('#playlist th.length').click();
    });
    $('#playlistHeadTable th.bitrate').click(function() {
        $('#playlist th.bitrate').click();
    });

    /**
        * initialize search
        */
    $('#searchInput').keydown(function(e) {
        if(e.keyCode == 13) {
            searchHandler();
        } else if (e.keyCode == 27) {
            ditchSearch();
        }
    });

    $('#ditchSearch').click(ditchSearch)
        .button({
            icons: {
                primary: 'ui-icon-circle-close'
            },
            text: false
        });

    $('#goSearch').click(searchHandler)
        .button({
            icons: {
                primary: 'ui-icon-circle-triangle-e'
            },
            text: false
        });

    $(window).resize(windowResize);

    $("#playMode").button({
        icons: {
            primary: 'ui-icon-refresh',
            secondary: 'ui-icon-triangle-1-s'
        }
    });

    $('#playModeMenu').buttonset();

    $('#playMode').click(function() {
        $('#playModeMenu').toggle();
    });
    
    $('#playModeMenu input').click(function() {
        $("#playMode .ui-button-text").text($(this).next().text());
        $('#playModeMenu').hide();
    });
    
    $('#playModeContainer').mouseleave(function() {
        $('#playModeMenu').hide();
    });
    
    $('#arepeat').button();
    $('#brepeat').button();
    $('#cancelrepeat').button();
    $('#arepeat').click(function() {
        $(document).data('arepeat', audio.currentTime);
        $(this).hide();
        $('#brepeat').show();
    });
    $('#brepeat').click(function() {
        var a = $(document).data('arepeat');
        var b = audio.currentTime;
        audio.currentTime = a;
        var interval = setInterval(function(){
            if (audio.currentTime > b) {
                audio.currentTime = a;
                console.log('repeat '+a+' '+b);
            }
        }, 50);
        $(document).data('abrepeatinterval', interval);
        $(this).hide();
        $('#cancelrepeat').show();
    });
    $('#cancelrepeat').click(function() {
        clearInterval($(document).data('abrepeatinterval'));
        $(this).hide();
        $('#arepeat').show();
    });
    
    setTimeout(function() {
        $("body").splitter({
            'sizeLeft' : true,
            'cursor'   : 'col-resize',
            'resizeToWidth' : true
        });
        $(window).resize();
    }, 100);
    
    // Detect an overrun VBR
    setInterval(function() {
        var t = $('.playing .length');
        if (t.length > 0) {
            sp = t.text().split(':');
            var m = Number(sp[0]);
            var s = Number(sp[1]);
            if (audio.currentTime > 60*m + s) {
                playListNextAndScrobble();
            }
        }
    }, 5000);
    
    var idsearch = window.location.href.match(/id=.*\/\d+/);
    if (idsearch != null) {
        var id = idsearch[0].split('=')[1];
        $.getJSON(
            '/hello/getTracksAJAX',
            {'id': id},
            function(data) {
                addToPlaylistCallback(data);
                playRow($('.song:first'));
            }
        );
    }
    
    if (window.location.hash == "#scrobble") {
        alert('scrobbling..');
    }
    
    screenMappings = {
        'playlistNav' : $('.browsePane, #browsePaneSplitter'),
        'nowPlayingNav' : $('#nowPlayingContainer')
    };
    
    $('div#navigation button.screen').click(function() {
        var self = $(this);
        if (!self.hasClass('selectedNav')) {
            var selected = $('.selectedNav');
            selected.removeClass('selectedNav');
            self.addClass('selectedNav');
            screenMappings[selected.attr('id')].fadeOut();
            screenMappings[self.attr('id')].fadeIn();
            windowResize();
        }
    });
    
    $('button#logout').click(function() {
        window.location = '/logout_handler';
    });
});

function windowResize(target) {
    $(document).data('windowHeightPx', $(window).height());
    $(document).data('windowWidthPx', $(window).width());
    var elements = $(".expandHeightToFitBrowser");
    for (var i=0; i<elements.length; i++) {
        expandHeightToFitBrowser($(elements[i]));
    }
}

function expandHeightToFitBrowser(element) {
    var elementTopPx = element.offset().top;
    var elementOffsetPx = element.attr('expandHeightOffsetPx');
    var elementHeightPx = $(document).data('windowHeightPx') - elementTopPx - elementOffsetPx;
    element.height(elementHeightPx);
}

function scrollTo(e, c) {

    if (!e) {
        return;
    }

    var eTop = e.offset().top;
    var eBottom = eTop + e.height();
    var cTop = c.offset().top;
    var cBottom = cTop + c.height();

    if ((eBottom > cBottom) || (eTop < cTop)) {
        if (eBottom > cBottom) {
            var scrollTop = c.attr('scrollTop') + (eBottom - cBottom) + 'px';
        } else if (eTop < cTop) {
            var scrollTop = c.attr('scrollTop') - (cTop - eTop) + 'px';
        }
        c.stop();
        c.animate({scrollTop: scrollTop}, 100);
    }

}

function scrollToBottom(c) {
    c.animate({scrollTop: c.attr('scrollHeight') + 'px'}, 500);
}

function scrollToTop(c) {
    c.animate({scrollTop: '0px'}, 500);
}

function addToPlaylist(id, target) {
    $(document).data('playlistDropTarget', target);
    $.getJSON(
        '/hello/getTracksAJAX',
        {'id': id},
        addToPlaylistCallback
    );
}

function addToPlaylistCallback(data) {
    var start = ($('.playing').length == 0);
    var insertText = '';
    $.each(data, function(count, trackJSON) {
        insertText += '<tr id="track_'+trackJSON['id']+'" class="song" href="'
            +trackJSON['filepath']+'">'
        + '<td class="artist">'+trackJSON['artist']+'</td>'
        + '<td class="title">'+trackJSON['title']+'</td>'
        + '<td class="album">'+trackJSON['album']+'</td>'
        + '<td class="tracknum">'+trackJSON['tracknum']+'</td>'
        + '<td class="length">'+trackJSON['length']+'</td>'
        + '<td class="bitrate">'+trackJSON['bitrate']+'</td>'
        + '</tr>';
    });
    var dropTarget = $(document).data('playlistDropTarget');
    if (dropTarget && dropTarget.tagName == 'TD') {
        $(dropTarget).parent().after(insertText);
    } else {
        $("#playlistbody").append(insertText);
    }
    $('#playlist thead th').unbind('click');
    $('#playlist').tablesorter();
    if (start) {
        playRow($('#track_' + data[0]['id']));
    }
}

function searchHandler() {
    var searchStr = $('#searchInput').attr('value').trim();
    if (searchStr == "") {
        ditchSearch();
    } else {
        search(searchStr);
    }
}

function search(searchStr) {
    $.getJSON(
        '/hello/searchAJAX',
        {'search' : searchStr},
        searchCallback
    );
}

function searchCallback(results) {
    $('#browser').hide();
    $('#searchBrowser').show();
    $('#searchBrowser').tree({
        data : {
            async : true,
            type : 'json',
            opts : {
                url : '/hello/treeBrowseAJAX'
            }
        },
        callback : { 
            // Make sure static is not used once the tree has loaded for the first time
            onload : function (t) { 
                t.settings.data.opts.static = false; 
            },
            // Take care of refresh calls - n will be false only when the whole tree is refreshed or loaded of the first time
            beforedata : function (n, t) {
                if(n == false) t.settings.data.opts.static = results;
                return { id : $(n).attr("id") || 'init' };
            }
        },
        ui : {
            theme_name : 'default'
        },
        plugins : {
            hotkeys : { }
        },
        types : {
            'default' : {
                clickable	: true,
                renameable	: false,
                deletable	: false,
                creatable	: false,
                draggable	: false,
                max_children	: -1,
                max_depth	: -1,
                valid_children	: 'all',
                icon : {
                    image : false,
                    position : false
                }
            },
            'Artist': {
                icon: {
                    image: '/static/icons/person4small.gif'
                }
            },
            'Album': {
                icon: {
                    image: '/static/icons/cd2small.gif'
                }
            },
            'Track': {
                icon: {
                    image: '/static/icons/note2small.jpg'
                }
            }
        }
    });
}

function ditchSearch() {
    $('#searchInput').attr('value', '');
    $('#browser').show();
    $('#searchBrowser').hide();
}

String.prototype.trim = function() {
    return this.replace(/^\s+|\s+$/g,"");
}

function playRow(row) {
    $('.playing').removeClass('playing');
    $("#jquery_jplayer").jPlayer("setFile", row.attr('href'))
        .jPlayer("play");
    row.addClass('playing');
    setDocumentTitle($('.artist', row).text() + ' - ' +
        $('.title', row).text());
    populatePlayingTrackInfo(row.attr('id'));
    $('#play').hide();
    $('#pause').show();
}

function setDocumentTitle(title) {
    document.title = title;
}

function stop() {
    $("#jquery_jplayer").jPlayer("stop");
}

function play() {
    playRow($(this));
}

function playlistNextPrev(next) {
    var playing = $('.playing');
    if (playing) {
        playing.removeClass('playing');
        if (next) {
            if (playing.next().hasClass('song')) {
                playing.next().addClass('playing');
                playRow(playing.next());
            } else if ($('#playlistRepeat').attr('checked')) {
                $('.song:first').dblclick();
            } else if ($('#playlistRandomTrack').attr('checked')) {
                nextRandomTrack();
            } else if ($('#playlistRandomAlbum').attr('checked')) {
                nextRandomAlbum();
            } else if ($('#playlistSimilarTrack').attr('checked')) {
                nextSimilarTrack(playing.attr('id'));
            } else {
                $('#play').show();
                $('#pause').hide();
            }
        } else {
            if (playing.prev().hasClass('song')) {
                playing.prev().addClass('playing');
                playRow(playing.prev());
            } else {
                $('#play').show();
                $('#pause').hide();
            }
        }
    }
}

function playListPrev() {
    playlistNextPrev(false);
}

function playListNext() {
    playlistNextPrev(true);
}

function playListNextAndScrobble() {
    if (window.location.hash == "#scrobble") {
        scrobbleTrack($('.playing').attr('id'));
    }
    playListNext();
}

function scrobbleTrack(id) {
    $.getJSON(
        '/hello/scrobbleTrackAJAX',
        {'id':id}
    );
}

function nextRandomTrack() {
    $.getJSON(
        '/hello/randomTrackAJAX',
        {},
        playAJAXCallback
    );
}

function nextRandomAlbum() {
    $.getJSON(
        '/hello/randomAlbumAJAX',
        {},
        playAJAXCallback
    );
}

function nextSimilarTrack(id) {
    $.getJSON(
        '/hello/similarTrackAJAX',
        {'id':id},
        playAJAXCallback
    );
}

function playAJAXCallback(data) {
    var last = $('.song:last');
    $(document).data('playlistDropTarget', null);
    addToPlaylistCallback(data);
    last.next('.song').dblclick();
}

var lyricsWidget = (function () {

    var lyricsContainer;
    var playedTime;
    var recording;
    var recordedFrames;
    var playingFrames;
    var playingFrameIdx;
    var playingLineIdx;
    var trackid;

    function init() {
        lyricsContainer = $('#nowPlayingTrackLyrics');
        $('#nowPlayingTrackHeader').click(startRecording);
        $('#lyricsRecordingCancel').click(function() {
            stopRecording();
            recordedFrames = [];
        });
        $('#lyricsRecordingSubmit').click(function() {
            saveRecordedFrames();
            stopRecording();
            recordedFrames = [];
        });
        $('.lyricsLine').live('click', function() {
            var lineIdx = parseInt($(this).attr('id').split('_')[1]);
            if (recording) {
                recordedFrames.push([playedTime, lineIdx]);
            } else {
                jumpPlayerToLyric(lineIdx);
            }
        });
        $('.lyricsLine').live('hover', function() {
            if (recording) {
                $(this).toggleClass('highlightedLyrics');
            }
        });
        playedTime = 0;
        recording = false;
        recordedFrames = [];
        playingFrames = null;
        playingFrameIdx = 0;
        playingLineIdx = undefined;
    };

    function startRecording() {
        recording = true;
        $('#lyricsRecordingCancel').show();
        $('#lyricsRecordingSubmit').show();
    }

    function stopRecording() {
        recording = false;
        $('#lyricsRecordingCancel').hide();
        $('#lyricsRecordingSubmit').hide();
    }

    function saveRecordedFrames() {
        $.post('/hello/saveLyricsFramesAJAX',
           {'frames' : JSON.stringify(recordedFrames),
            'trackid' : trackid});
    }

    function jumpPlayerToLyric(lineIdx) {
        for (i = 0; i < playingFrames.length; i++) {
            var frame = playingFrames[i];
            if (lineIdx == frame[1]) {
                var timeToJumpTo = frame[0];
                $('#jquery_jplayer').jPlayer('playHeadTime', timeToJumpTo);
                return;
            }
        }
    }

    function lyricsAjaxCallback(data) {
        if ('lyrics' in data) {
            var lyricsLines = data['lyrics'].split('<br />');
            var lyricsHtml = '';
            for (i = 0; i < lyricsLines.length; i++) {
                lyricsHtml += '<span class="lyricsLine" id="lyricsLine_'+i+'">'
                            + lyricsLines[i]
                            + '</span><br />';
            }
            lyricsContainer.html(lyricsHtml);
            playingFrames = data['frames'];
            playingFrameIdx = 0;
            playingLineIdx = undefined;
            trackid = data['trackid'];
        } else {
            lyricsContainer.html('');
        }
        expandHeightToFitBrowser(lyricsContainer);
    };

    function updateFromPlayer(pt) {
        playedTime = pt;
        if (!recording && playingFrames !== null) {
            updatePlayingFrame();
        }
    };

    function setPlayingLineIdx(newIdx) {
        if (newIdx != playingLineIdx) {
            playingLineIdx = newIdx;
            $('.lyricsLine').removeClass('highlightedLyrics');
            if (newIdx !== undefined) {
                $('#lyricsLine_'+newIdx).addClass('highlightedLyrics');
            }
        }
    }

    // recursive search for the frame windowing the current playedTime
    function updatePlayingFrame() {
        if (playedTime >= playingFrames[playingFrameIdx][0]) {
            if ((playingFrameIdx+1 == playingFrames.length) /*last frame?*/ || (playedTime < playingFrames[playingFrameIdx+1][0])) {
                setPlayingLineIdx(playingFrames[playingFrameIdx][1]); // we're already in the right frame
            } else {
                playingFrameIdx++;                                    // try the next frame
                updatePlayingFrame();
            }
        } else if (playingFrameIdx > 0) {
            playingFrameIdx--;                                        // try the previous frame
            updatePlayingFrame();
        } else {
            setPlayingLineIdx(undefined);                             // we're before the very first frame
        }
    }

    return {
        init : init,
        lyricsAjaxCallback : lyricsAjaxCallback,
        updateFromPlayer : updateFromPlayer
    };

})();

function populatePlayingTrackInfo(trackid) {
    $.getJSON(
        '/hello/getTrackInfoAJAX',
        {'trackid': trackid},
        function(data) {
            $('#playingArtist').html(data['artist']);
            $('#nowPlayingArtistHeader').html(data['artist']);
            $('#playingAlbum').html(data['album']);
            $('#nowPlayingAlbumHeader').html(data['album']);
            $('#playingTrack').html(data['track']);
            $('#nowPlayingTrackHeader').html(data['track']);
            if ('asin' in data) {
                $('#nowPlayingAlbumInfo').html('<a target="_blank" href="http://www.amazon.com/dp/' + data['asin'] + '">amazon</a>');
            } else {
                $('#nowPlayingAlbumInfo').html('');
            }
        }
    );
    $.getJSON(
        '/hello/getAlbumArtAJAX',
        {'trackid': trackid},
        function(data) {
            if ('albumArtURL' in data) {
                $('img.albumArt').attr('src', data['albumArtURL']);
                $('a.albumArt').attr('href', data['albumArtURL']);
                $('a#nowPlayingAlbumArtImageLink').fancybox();
            } else {
                $('img.albumArt').removeAttr('src');
                $('img.albumArt.dashboardIcon').attr('src', '/static/icons/vinyl.png');
                $('#nowPlayingAlbumArtImage').attr('src', '/static/icons/coverunavailable.jpg');
                $('a.albumArt').removeAttr('href');
            }
        }
    );
    $.getJSON(
        '/hello/getLyricsAJAX',
        {'trackid': trackid},
        lyricsWidget.lyricsAjaxCallback
    );
    $.getJSON(
        '/hello/getArtistInfoAJAX',
        {'trackid': trackid},
        function(data) {
            if ('bio' in data) {
                $('#nowPlayingArtistBio').html(data['bio']);
            } else {
                $('#nowPlayingArtistBio').html('');
            }
            expandHeightToFitBrowser($('#nowPlayingArtistBio'));
            $('#nowPlayingArtistImageContainer').empty();
            if ('images' in data && data['images'].length > 0) {
                $('#nowPlayingArtistImageContainer').append(
                    $('<a href="'+data['images'][0][1]+'" rel="artist">')
                        .append('<img class="nowPlayingArtistImage" src="'+data['images'][0][1]+'">')
                        .load(function(){expandHeightToFitBrowser($('#nowPlayingArtistBio'));})
                        .fancybox({speedIn : '100'}));
                for (var i=1; i<data['images'].length; i++) {
                    $('#nowPlayingArtistImageContainer').append(
                        $('<a href="'+data['images'][i][1]+'" rel="artist" style="display: none;">')
                            .fancybox({speedIn : '100'}));
                }
            } else {
                $('#nowPlayingArtistImageContainer').append(
                    $('<img class="nowPlayingArtistImage" src="/static/icons/artistimageunavailable.jpg">')
                );
            }
        }
    );
}

