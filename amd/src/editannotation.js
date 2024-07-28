// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Edit interactions module
 *
 * @module     mod_interactivevideo/editannotation
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['jquery',
    'core/toast',
    'core/notification',
    'core/event_dispatcher',
    'mod_interactivevideo/libraries/jquery-ui',
], function ($, addToast, Notification, { dispatchEvent }) {
    var ctRenderer = new Object();
    var player;
    var totaltime;
    var currentTime;
    var playerReady = false;
    /**
     * Replace the progress bar on the video navigation.
     * @param {Number} percentage - Percentage to replace the progress bar.
     * @returns {void}
     * */
    const replaceProgressBars = (percentage) => {
        percentage = percentage > 100 ? 100 : percentage;
        $('#video-nav #progress').replaceWith(`<div id="progress"  style="width: ${percentage}%;"></div>`);
        $('#scrollbar').css('left', percentage + '%');
    };
    /**
     * Render the annotations on the video navigation.
     * @param {Array} annos - Annotations to render.
     * @param {Number} start - Start time of the video.
     * @param {Number} totaltime - Total time of the video.
     * @returns {void}
     * */
    const renderVideoNav = async (annos, start, totaltime) => {
        if (annos.length == 0) {
            $("#video-nav ul").empty();
            return;
        }

        $("#video-nav ul").empty();
        $("#video-timeline-wrapper .skipsegment").remove();
        annos.forEach(async (x) => {
            var render = ctRenderer[x.type];
            await render.renderItemOnVideoNavigation(x);
        });

        player.getCurrentTime().then((time) => {
            // Replace progress bar.
            var percentage = (time - start) / totaltime * 100;
            replaceProgressBars(percentage);
            return;
        }).catch(() => {
            // Do nothing.
        });

        dispatchEvent('annotationitemsrendered', { 'annotations': annos });

    };


    return {
        init: function (url, coursemodule, interaction, course, start, end, coursecontextid, type = 'yt') {
            const addNotification = (msg, type = "info") => {
                addToast.add(msg, {
                    type: type
                });
            };

            start = Number(start);
            if (isNaN(start)) {
                start = 0;
            }

            end = Number(end);
            if (isNaN(end)) {
                end = null;
            }

            var annotations = [];
            var contentTypes;

            const convertSecondsToHMS = (s, dynamic = false) => {
                var hours = Math.floor(s / 3600);
                var minutes = Math.floor(s % 3600 / 60);
                var seconds = Math.floor(s % 3600 % 60);
                if (dynamic && hours == 0) {
                    return (minutes < 10 ? '0' + minutes : minutes) + ':' +
                        (seconds < 10 ? '0' + seconds : seconds);
                }
                return (hours < 10 ? '0' + hours : hours) + ':' +
                    (minutes < 10 ? '0' + minutes : minutes) + ':' +
                    (seconds < 10 ? '0' + seconds : seconds);
            };

            var activeid = null; // Current active annotation id. Mainly used when editing to relaunch the interaction afte editing.
            const renderAnnotationItems = (annotations) => {
                renderVideoNav(annotations, start, totaltime);
                $('#annotationwrapper .loader').remove();
                $('#annotation-list').empty().removeClass("d-flex align-items-center justify-content-center");
                if (annotations.length == 0) {
                    $('#annotation-list').html(`${M.util.get_string('clickaddtoaddinteraction', 'mod_interactivevideo')}`)
                        .addClass("d-flex align-items-center justify-content-center");
                    return;
                }
                annotations.sort(function (a, b) {
                    return Number(a.timestamp) - Number(b.timestamp);
                });

                annotations.forEach(function (item) {
                    var listItem = $('#annotation-template').clone();
                    ctRenderer[item.type].renderEditItem(annotations, listItem, item);
                });

                var xp = annotations.filter(x => x.xp).map(x => Number(x.xp)).reduce((a, b) => a + b, 0);
                $("#xp span").text(xp);

                if (activeid) {
                    var activeAnno = annotations.find(x => x.id == activeid);
                    if (activeAnno) {
                        ctRenderer[activeAnno.type].postEditCallback(activeAnno);
                    }
                }
            };

            const getAnnotations = () => {
                const getItems = $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'get_items',
                        sesskey: M.cfg.sesskey,
                        id: interaction,
                        contextid: M.cfg.courseContextId,
                    }
                });

                const getContentTypes = $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'getallcontenttypes',
                        sesskey: M.cfg.sesskey,
                    }
                });

                $.when(getItems, getContentTypes).done(function (items, contenttypes) {
                    annotations = JSON.parse(items[0]);
                    contentTypes = JSON.parse(contenttypes[0]);
                    // Remove all annotations that are not in the content types.
                    annotations = annotations.filter(x => contentTypes.find(y => y.name === x.type));
                    const getRenderers = new Promise((resolve) => {
                        var count = 0;
                        contentTypes.forEach(x => {
                            require(['' + x.amdmodule], function (Type) {
                                ctRenderer[x.name] = new Type(player, annotations, interaction,
                                    course, 0, 0, 0, 0, type, 0, totaltime, start, end, x, coursemodule);
                                count++;
                                if (count == contentTypes.length) {
                                    resolve(ctRenderer);
                                }
                            });
                        });
                    });
                    annotations.map(x => {
                        x.prop = JSON.stringify(contentTypes.find(y => y.name === x.type));
                        return x;
                    });
                    getRenderers.then(() => {
                        renderAnnotationItems(annotations);
                        return;
                    }).catch(() => {
                        // Do nothing.
                    });
                });
            };

            const validateTimestampFormat = (timestamp, fld, existing) => {
                var regex = /^([0-9]{2}):([0-5][0-9]):([0-5][0-9])$/;
                if (!regex.test(timestamp)) {
                    addNotification(M.util.get_string('invalidtimestampformat', 'mod_interactivevideo'), 'danger');
                    if (existing) {
                        $(fld).val(existing);
                    } else {
                        $(fld).val(convertSecondsToHMS(start));
                    }
                    return false;
                }
                return true;
            };

            const validateTimeStartEnd = (timestamp, fld, existing, seconds, checkduration,
                checkexisting, checkskipsegment) => {
                // Convert the timestamp to seconds.
                var parts = timestamp.split(':');
                timestamp = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
                // Make sure the timestamp is between start and end.
                if (checkduration) {
                    if (timestamp > end || timestamp < start) {
                        var message = M.util.get_string('timemustbebetweenstartandendtime', 'mod_interactivevideo', {
                            "start": convertSecondsToHMS(start, true),
                            "end": convertSecondsToHMS(end, true)
                        });
                        addNotification(message, 'danger');
                        if (existing) {
                            $(fld).val(existing);
                        } else {
                            $(fld).val(convertSecondsToHMS(start));
                        }
                        return -1;
                    }
                }

                // Make sure the timestamp is not already in the list.
                if (checkexisting) {
                    if (annotations.find(x => x.timestamp == timestamp) && timestamp != seconds) {
                        addNotification(M.util.get_string('interactionalreadyexists', 'mod_interactivevideo'), 'danger');
                        if (existing) {
                            $(fld).val(existing);
                        } else {
                            $(fld).val(convertSecondsToHMS(start));
                        }
                        return -1;
                    }
                }

                // Make sure timestamp is not in a skip segment.
                if (checkskipsegment) {
                    var skipsegments = annotations.filter((annotation) => annotation.type == 'skipsegment');
                    var skip = skipsegments.find(x => Number(x.timestamp) < Number(timestamp)
                        && Number(x.title) > Number(timestamp));
                    if (skip) {
                        addNotification(M.util.get_string('interactionisbetweentheskipsegment', 'mod_interactivevideo', {
                            "start": convertSecondsToHMS(skip.timestamp, true),
                            "end": convertSecondsToHMS(skip.title, true)
                        }), 'danger');
                        if (existing) {
                            $(fld).val(existing);
                        } else {
                            $(fld).val(convertSecondsToHMS(start));
                        }
                        return -1;
                    }
                }

                return timestamp;

            };

            const runInteraction = (annotation) => {
                // Remove the previous message but keep the one below the video.
                $('#annotation-modal').modal('hide');
                $('#message').not('[data-placement=bottom]').remove();
                $('#end-screen').remove();
                player.pause();
                var activityType = ctRenderer[annotation.type];
                activityType.runInteraction(annotation);
            };

            const onReady = () => {
                let duration = player.getDuration();
                duration.then(t => {
                    if (!end) {
                        end = t;
                    } else {
                        end = Math.min(end, t);
                    }

                    if (start > end) {
                        start = 0;
                    }

                    totaltime = end - start;
                    // Recalculate the ratio of the video
                    player.ratio().then((ratio) => {
                        $("#video-wrapper").css('padding-bottom', (1 / ratio) * 100 + '%');
                    });
                    playerReady = true;

                    // Handle timeline block
                    $("#timeline #video-timeline").css({
                        'background-image': 'url(' + player.posterImage + ')',
                        'background-size': 'contain',
                        'background-repeat': 'no-repeat',
                    });
                    $("#timeline #duration").text(convertSecondsToHMS(end, true));
                    $("#timeline #currenttime").text(convertSecondsToHMS(start, true));
                    // Render minute markers
                    const minutes = Math.floor(totaltime / 60);
                    $('#timeline-items-wrapper').css('width', (minutes * 300) + 'px');
                    $('#timeline-items .minute').remove();
                    for (let i = start; i <= end; i += 60) {
                        let percentage = (i - start) / totaltime * 100;
                        let marker = '';
                        // Format h:m (e.g 3h1m);
                        if (i >= 3600) {
                            marker = Math.floor(i / 3600) + 'h' + Math.floor((i % 3600) / 60) + 'm';
                        } else {
                            marker = Math.floor(i / 60) + 'm';
                        }
                        $('#timeline-items').append(`<div class="minute position-absolute" style="left: ${percentage}%">
                            <div class="minute-label">${marker}</div></div>`);
                    }
                    return getAnnotations();
                }).catch(() => {
                    // Do nothing.
                });

            };

            const onEnded = () => {
                player.pause();
                $('#playpause').find('i').removeClass('bi-pause-fill').addClass('bi-play-fill');
                // Cover the video with a message on a white background div.
                $('#video-wrapper').append(`<div id="end-screen" class="position-absolute w-100 h-100 bg-white d-flex
                     justify-content-center align-items-center style="top: 0; left: 0;">
                     <button class="btn btn-danger rounded-circle" style="font-size: 1.5rem;" id="restart">
                    <i class="bi bi-arrow-repeat" style="font-size: x-large;"></i></button></div>`);
                $('#video-nav #progress').css('width', '100%');
                $('#scrollbar').css('left', '100%');
                // Focus on the restart button;
                $('#message #restart').focus();

                // If the current time matches the timestamp of an annotation, highlight the annotation
                var currentAnnotation = annotations.find((annotation) => annotation.timestamp == end);
                if (currentAnnotation) {
                    $('#annotation-list tr').removeClass('active');
                    $(`tr[data-id="${currentAnnotation.id}"]`).addClass('active');

                    // Show tooltip for two seconds
                    // toggle the tooltip to show the title
                    $('#video-nav .annotation[data-id="' + currentAnnotation.id + '"] .item').tooltip('show');
                    // Hide the tooltip after 2 seconds
                    setTimeout(function () {
                        $('#video-nav .annotation[data-id="' + currentAnnotation.id + '"] .item').tooltip('hide');
                    }, 2000);
                }
            };

            const onSeek = async (t) => {
                if (!playerReady) {
                    return;
                }
                if (t) {
                    t = Number(t);
                } else {
                    t = await player.getCurrentTime();
                }
                if (t > start && t < end) {
                    $('#end-screen').remove();
                }
                var percentage = (t - start) / (totaltime) * 100;
                $('#scrollbar').css('left', percentage + '%');
                return $('#timeline #currenttime').text(convertSecondsToHMS(t, true));
            };

            var onPlayingInterval;
            const onPlaying = () => {
                $('#message, #end-screen').remove();
                $('#playpause').find('i').removeClass('bi-play-fill').addClass('bi-pause-fill');
                var intervalFunction = async function () {
                    var thisTime = await player.getCurrentTime();
                    var isPlaying = await player.isPlaying();
                    var isEnded = await player.isEnded();
                    if (!isPlaying || isEnded) {
                        clearInterval(onPlayingInterval);
                        return;
                    }

                    if (thisTime < start) {
                        await player.seek(start);
                        thisTime = start;
                    }

                    if (thisTime >= end) {
                        player.stop(end);
                        clearInterval(onPlayingInterval);
                        onEnded();
                        return;
                    }
                    $('#timeline #currenttime').text(convertSecondsToHMS(thisTime, true));
                    var percentage = (thisTime - start) / (totaltime) * 100;
                    $('#video-nav #progress').css('width', percentage + '%');

                    $("#scrollbar").css('left', percentage + '%');

                    // Scroll the timeline so that the current time is in the middle of the timeline.
                    const scrollBar = document.getElementById('scrollbar');
                    // Check if the scrollbar is in view.
                    const rect = scrollBar.getBoundingClientRect();
                    if (rect.left < 0 || rect.right > window.innerWidth) {
                        scrollBar.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
                    }

                    // If the current time matches the timestamp of an annotation, highlight the annotation
                    var currentAnnotation = annotations.find(x => (thisTime - player.frequency) <= x.timestamp
                        && (thisTime + player.frequency) >= x.timestamp);
                    if (currentAnnotation) {
                        $('#annotation-list tr').removeClass('active');
                        $(`tr[data-id="${currentAnnotation.id}"]`).addClass('active');

                        // Show tooltip for two seconds
                        // toggle the tooltip to show the title
                        $('#video-nav .annotation[data-id="' + currentAnnotation.id + '"] .item').tooltip('show');
                        // Hide the tooltip after 2 seconds
                        setTimeout(function () {
                            $('#video-nav .annotation[data-id="' + currentAnnotation.id + '"] .item').tooltip('hide');
                        }, 2000);
                    }

                    // If current time is within the skipsegment, seek to the end of the segment
                    var skipsegments = annotations.filter((annotation) => annotation.type == 'skipsegment');
                    var skip = skipsegments.find(x => Number(x.timestamp) < Number(thisTime)
                        && Number(x.title) > Number(thisTime));
                    if (skip) {
                        await player.seek(Number(skip.title));
                        // Replace the progress bar
                        percentage = (skip.title - start) / totaltime * 100;
                        replaceProgressBars(percentage);
                    }
                };
                if (player.type == 'yt' || player.type == 'wistia') {
                    onPlayingInterval = setInterval(intervalFunction, 100);
                } else {
                    intervalFunction();
                }
            };

            const onPause = () => {
                clearInterval(onPlayingInterval);
                $('#playpause').find('i').removeClass('bi-pause-fill').addClass('bi-play-fill');
            };

            // Implement the player
            require(['mod_interactivevideo/player/' + type], function (VideoPlayer) {
                player = new VideoPlayer(
                    url,
                    start,
                    end,
                    true,
                    true,
                );
            });

            $(document).on('iv:playerReady', function () {
                onReady();
            });

            $(document).on('iv:playerPaused', function () {
                onPause();
            });

            $(document).on('iv:playerPlaying', function () {
                onPlaying();
            });

            $(document).on('iv:playerEnded', function () {
                onEnded();
            });

            $(document).on('iv:playerSeek', function (e) {
                onSeek(e.detail.time);
            });

            $(document).on('annotationupdated', function (e) {
                var updated = e.originalEvent.detail.annotation;
                var action = e.originalEvent.detail.action;
                if (action == 'edit' || action == 'draft' || action == 'savedraft') {
                    annotations = annotations.filter(function (item) {
                        return item.id != updated.id;
                    });
                }
                updated.prop = JSON.stringify(contentTypes.find(x => x.name === updated.type));
                annotations.push(updated);
                if (action == 'add') {
                    activeid = updated.id;
                } else {
                    activeid = null;
                }

                renderAnnotationItems(annotations);
                if (action == 'add' || action == 'clone') {
                    addNotification(M.util.get_string('interactionadded', 'mod_interactivevideo'), 'success');
                    $(`tr[data-id="${updated.id}"]`).addClass('active');
                    if (action == 'clone') {
                        setTimeout(function () {
                            $(`tr[data-id="${updated.id}"]`).find(`[data-editable="timestamp"]`).trigger('contextmenu');
                        }, 100);
                    }
                } else if (action == 'edit') {
                    addNotification(M.util.get_string('interactionupdated', 'mod_interactivevideo'), 'success');
                    $(`tr[data-id="${updated.id}"]`).addClass('active');
                    setTimeout(function () {
                        $(`tr[data-id="${updated.id}"]`).removeClass('active');
                    }, 1500);
                }

                // If draft exists, activate the save button.
                if (annotations.find(x => x.status == 'draft')) {
                    $('#timeline #savedraft').removeAttr('disabled');
                } else {
                    $('#timeline #savedraft').attr('disabled', 'disabled');
                }
            });

            // Implement create annotation
            $(document).on('click', '#addcontentdropdown a', async function (e) {
                if (!playerReady) {
                    return;
                }
                e.preventDefault();
                $('#addcontentdropdown a').removeClass('active');
                $(this).addClass('active');
                var contenttype = $(this).data('type');
                player.pause();
                var timestamp = currentTime || await player.getCurrentTime();
                timestamp = Math.floor(timestamp);
                currentTime = null;
                ctRenderer[contenttype].addAnnotation(annotations, timestamp, coursemodule);
            });

            // Implement edit annotation
            $(document).on('click', 'tr .edit', async function (e) {
                e.preventDefault();
                var timestamp = $(this).closest('.annotation').data('timestamp');
                if (timestamp) {
                    await player.seek(timestamp, true);
                }
                player.pause();
                var id = $(this).closest('.annotation').data('id');
                var contenttype = $(this).closest('.annotation').data('type');
                ctRenderer[contenttype].editAnnotation(annotations, id, coursemodule);
            });

            // Implement copy annotation
            $(document).on('click', 'tr .copy', function (e) {
                e.preventDefault();
                var id = $(this).closest('.annotation').data('id');
                var contenttype = $(this).closest('.annotation').data('type');
                ctRenderer[contenttype].cloneAnnotation(id);
            });

            $(document).on('annotationdeleted', function (e) {
                var annotation = e.originalEvent.detail.annotation;
                activeid = null;
                $(`tr[data-id="${annotation.id}"]`).addClass('deleted');
                setTimeout(function () {
                    annotations = annotations.filter(function (item) {
                        return item.id != annotation.id;
                    });
                    renderAnnotationItems(annotations);
                    addNotification(M.util.get_string('interactiondeleted', 'mod_interactivevideo'), 'success');
                }, 1000);
            });

            // Implement delete annotation.
            $(document).on('click', '.delete', function (e) {
                e.preventDefault();
                player.pause();
                var id = $(this).closest('.annotation').data('id');
                var annotation = annotations.find(x => x.id == id);
                Notification.saveCancel(
                    M.util.get_string('deleteinteraction', 'mod_interactivevideo'),
                    M.util.get_string('deleteinteractionconfirm', 'mod_interactivevideo'),
                    M.util.get_string('delete', 'mod_interactivevideo'),
                    function () {
                        ctRenderer[annotation.type].deleteAnnotation(annotations, id);
                    },
                    null
                );

            });

            // Implement view annotation
            $(document).on('click', '.annotation .title', async function (e) {
                e.preventDefault();
                var timestamp = $(this).closest('.annotation').data('timestamp');
                await player.seek(timestamp, true);
                // Update the progress bar
                var percentage = (timestamp - start) / totaltime * 100;
                replaceProgressBars(percentage);

                var id = $(this).closest('.annotation').data('id');

                var theAnnotation = annotations.find(x => x.id == id);

                runInteraction(theAnnotation);
            });

            // Implement go to timestamp
            $(document).on('click', '.timestamp', async function (e) {
                e.preventDefault();
                var timestamp = $(this).data('timestamp');
                await player.seek(timestamp);
                player.play();
            });

            $(document).on('contextmenu', '#vseek, #video-timeline', async function (e) {
                if (!playerReady) {
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                var percentage = e.offsetX / $(this).width();
                replaceProgressBars(percentage * 100);
                currentTime = Math.floor(percentage * totaltime) + start;
                await player.seek(currentTime);
                player.pause();
                $("#addcontent").trigger('click');
            });

            $(document).on('click', '#playpause', async function (e) {
                if (!playerReady) {
                    return;
                }
                e.preventDefault();
                // Pause or resume the video.
                let isPlaying = await player.isPlaying();
                if (isPlaying) {
                    player.pause();
                } else {
                    let t = await player.getCurrentTime();
                    if (t >= end) {
                        $('#end-screen #restart').trigger('click');
                    } else {
                        player.play();
                    }
                }
            });

            $(document).on('contextmenu', '#video-nav .annotation', function (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                var id = $(this).data('id');
                // Trigger click on the edit button
                $(`tr.annotation[data-id="${id}"] .edit`).trigger('click');
            });

            // Quick edit
            $(document).on('contextmenu', '[data-editable]', function (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if ($('[data-field].editing').length > 0) {
                    return;
                }
                var fld = $(this).data('editable');
                $(this).hide();
                $(this).siblings('[data-field="' + fld + '"]').removeClass('d-none').focus().addClass('editing');
            });

            $(document).on('keyup', '[data-field].editing', function (e) {
                $(this).removeClass('is-invalid');
                var initialValue = $(this).data('initial-value');
                var val = $(this).val();
                var fld = $(this).data('field');
                if (val == '') {
                    $(this).addClass('is-invalid');
                }

                // If escape key is pressed, revert the value
                if (e.key == 'Escape') {
                    $(this).val(initialValue);
                    $(this).removeClass('editing');
                    $(this).addClass('d-none');
                    $(this).siblings('[data-editable]').show();
                    return;
                }
                // If enter key is pressed, save the value
                if (e.key == 'Enter') {
                    var seconds;
                    if (fld == 'timestamp') {
                        var parts = initialValue.split(':');
                        seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
                        if (!validateTimestampFormat(val, '[data-field].editing', initialValue)) {
                            $(this).addClass('is-invalid');
                            return;
                        }
                        var timestamp = validateTimeStartEnd(val, '[data-field].editing', initialValue, seconds,
                            true, true, true);
                        if (timestamp == -1) {
                            window.console.log('wtf');
                            $(this).addClass('is-invalid');
                            return;
                        }
                        seconds = timestamp;
                    }

                    if ($(this).hasClass('is-invalid')) {
                        return;
                    }
                    if (val == initialValue) {
                        $(this).removeClass('editing');
                        $(this).addClass('d-none');
                        $(this).siblings('[data-editable]').show();
                        return;
                    }
                    var id = $(this).data('id');
                    $.ajax({
                        url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                        method: "POST",
                        dataType: "text",
                        data: {
                            action: 'quickeditfield',
                            sesskey: M.cfg.sesskey,
                            id: id,
                            field: fld,
                            contextid: M.cfg.contextid,
                            value: fld == 'timestamp' ? seconds : val,
                        },
                        success: function (data) {
                            var updated = JSON.parse(data);
                            dispatchEvent('annotationupdated', {
                                annotation: updated,
                                action: 'edit'
                            });
                        }
                    });
                    return;
                }
            });

            $(document).on('blur', '[data-field].editing', function () {
                var initialValue = $(this).data('initial-value');
                $(this).val(initialValue);
                $(this).removeClass('editing');
                $(this).addClass('d-none');
                $(this).siblings('[data-editable]').show();
            });
            // End quick edit

            $(document).on('click', '#end-screen #restart', async function (e) {
                e.preventDefault();
                $('#end-screen').remove();
                await player.seek(start);
                player.play();
            });

            $(document).on('mouseover', 'tr.annotation', function () {
                var id = $(this).data('id');
                $(`#video-nav ul li[data-id="${id}"] .item`).trigger('mouseover');
            });

            $(document).on('mouseout', 'tr.annotation', function () {
                var id = $(this).data('id');
                $(`#video-nav ul li[data-id="${id}"] .item`).trigger('mouseout');
                $('.tooltip').remove();
            });

            $(document).on('mouseover', '#video-nav ul li', function () {
                var id = $(this).data('id');
                $(`tr.annotation[data-id="${id}"]`).addClass('active');
            });

            $(document).on('mouseout', '#video-nav ul li', function () {
                var id = $(this).data('id');
                $(`tr.annotation[data-id="${id}"]`).removeClass('active');
            });

            $(document).on('change', '.timestamp-input, .timestamp-field input', function () {
                $(this).removeClass('is-invalid');
                var parts = $(this).val().split(':');
                var seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
                if (!validateTimestampFormat($(this).val(), this)) {
                    $(this).addClass('is-invalid');
                    return;
                }

                var timestamp = validateTimeStartEnd($(this).val(), this, "00:00:00", seconds, true, false, true);

                if (timestamp == -1) {
                    $(this).addClass('is-invalid');
                    return;
                }
            });

            $('#contentmodal').on('show.bs.modal', function () {
                player.pause();
                $('#addcontentdropdown').addClass('modal-body');
            });

            $('#contentmodal').on('hide.bs.modal', function () {
                $('#addcontentdropdown a').removeClass('active');
                $('#addcontentdropdown').removeClass('modal-body');
            });

            $(document).on('click', '#fullscreen', function (e) {
                e.preventDefault();
                if ($(this).hasClass('fullscreen')) {
                    $('#distractfreemodal').modal('hide');

                } else {
                    let modal = `<div class="modal fade p-0" id="distractfreemodal"
                     role="dialog" aria-hidden="true" data-backdrop="static"
                    data-keyboard="false">
                    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document">
                        <div class="modal-content rounded-0 p-3">
                            <div class="modal-body px-1 px-sm-3" id="distractionfreebody">
                <div class="d-flex w-100 align-items-center justify-content-center mt-5"><div class="spinner-grow text-secondary"
                    style="width: 3rem; height: 3rem;" role="status">
                <span class="sr-only">Loading...</span>
                </div></div>
                            </div>
                        </div>
                    </div>
                </div>`;
                    $('body').append(modal);
                    $('#distractfreemodal').modal('show');
                }

                $(this).toggleClass('fullscreen');

                $('#distractfreemodal').on('shown.bs.modal', function () {
                    $('body').addClass('distractionfreemode');
                    let $wrapper = $('#wrapper').clone();
                    $('#distractfreemodal').find('#distractionfreebody').html($wrapper);
                    // Remove original wrapper
                    $('#wrapper').remove();
                });
                $('#distractfreemodal').on('hidden.bs.modal', function () {
                    $('body').removeClass('distractionfreemode');
                    let $wrapper = $('#distractfreemodal #wrapper').clone();
                    $('[role="main"]').append($wrapper);
                    $('#distractfreemodal').remove();
                });
            });

            const appendTimestamp = (seconds) => {
                var formattedTime = convertSecondsToHMS(seconds, true);
                $('#scrollbar').append(`<div id="position" class="position-absolute bg-black text-white small rounded-sm p-1"
                     style="top: -30px;">${formattedTime}</div>`);
            };

            $(document).on('annotationitemsrendered', function () {
                let secondLength = $('#timeline-items').width() / totaltime;
                $('#timeline [data-toggle="tooltip"]').tooltip({
                    'boundary': 'window',
                    'container': '#timeline',
                });
                // Put the minute markers on the timeline;
                let targetAnnotation = null;
                // Tested
                $('#timeline-items .annotation.li-draggable').draggable({
                    // 'containment': '#timeline',
                    'axis': 'x',
                    'grid': [secondLength, 0],
                    'start': function () {
                        appendTimestamp($(this).data('timestamp'));
                        $('.tooltip, #message').remove();
                        $('#timeline-items').addClass('no-pointer-events');
                    },
                    'drag': async function (event, ui) {
                        $('.tooltip').remove();
                        let timestamp = ((ui.position.left + 5) / $('#timeline-items').width()) * totaltime + start;
                        if (timestamp < start) {
                            timestamp = start;
                            $(this).css('left', 0);
                        }
                        if (timestamp > end) {
                            timestamp = end;
                            $(this).css('left', '100%');
                        }
                        $('#scrollbar').css('left', timestamp / end * 100 + '%');
                        await player.seek(Math.round(timestamp));
                        player.pause();
                        $('#scrollbar #position').text(convertSecondsToHMS(Math.round(timestamp), true));
                    },
                    'stop': async function (event, ui) {
                        $('.tooltip').remove();
                        $('#scrollbar #position').remove();
                        setTimeout(function () {
                            $('#timeline-items').removeClass('no-pointer-events');
                        }, 200);
                        let timestamp = ((ui.position.left + 5) / $('#timeline-items').width()) * totaltime + start;
                        if (timestamp < start) {
                            timestamp = start;
                            $(this).css('left', '-5px');
                        }
                        if (timestamp > end) {
                            timestamp = end;
                            $(this).css('left', 'calc(100% - 5px)');
                        }
                        $('#scrollbar').css('left', timestamp / end * 100 + '%');
                        const id = $(this).data('id');
                        targetAnnotation = annotations.find(x => x.id == id);
                        const existingAnnotation = annotations.find(x => x.timestamp == Math.round(timestamp) && x.id != id);
                        if (existingAnnotation) {
                            addNotification(M.util.get_string('interactionalreadyexists', 'mod_interactivevideo'), 'danger');
                            renderAnnotationItems(annotations);
                            return;
                        }
                        if (targetAnnotation.timestamp == Math.round(timestamp)) {
                            return;
                        }
                        targetAnnotation.timestamp = Math.round(timestamp);
                        targetAnnotation.status = "draft";
                        dispatchEvent('annotationupdated', {
                            annotation: targetAnnotation,
                            action: 'draft'
                        });
                        await player.seek(Math.round(timestamp)); // Seek to the new position
                        player.pause();
                        $('#scrollbar').css('left', timestamp / end * 100 + '%');
                    }
                });

                $('#video-timeline-wrapper .skipsegment').draggable({
                    'axis': 'x',
                    'grid': [secondLength, 0],
                    'start': function () {
                        $('#message').remove();
                        appendTimestamp($(this).data('timestamp'));
                        $('#timeline-items').addClass('no-pointer-events');
                    },
                    'drag': async function (event, ui) {
                        const id = $(this).data('id');
                        targetAnnotation = annotations.find(x => x.id == id);
                        let timestamp = ((ui.position.left) / $('#video-timeline').width()) * totaltime + start;
                        if (timestamp < start) {
                            timestamp = start;
                        }

                        if (timestamp > end) {
                            timestamp = end;
                        }

                        $('#scrollbar').css('left', timestamp / end * 100 + '%');
                        await player.seek(Math.round(timestamp));
                        player.pause();
                        $('#scrollbar #position').text(convertSecondsToHMS(Math.round(timestamp), true));
                    },
                    'stop': async function (event, ui) {
                        $('#scrollbar #position').remove();
                        setTimeout(function () {
                            $('#timeline-items').removeClass('no-pointer-events');
                        }, 200);
                        let timestamp = ((ui.position.left) / $('#video-timeline').width()) * totaltime + start;
                        const id = $(this).data('id');
                        targetAnnotation = annotations.find(x => x.id == id);
                        let skipduration = Number(targetAnnotation.title) - Number(targetAnnotation.timestamp);
                        if (timestamp < 0 && timestamp + skipduration < start) {
                            renderAnnotationItems(annotations);
                            return;
                        }
                        if (timestamp > end) {
                            renderAnnotationItems(annotations);
                            return;
                        }
                        if (timestamp < start) {
                            skipduration = skipduration - Math.abs(start - timestamp);
                            timestamp = start;
                        }
                        if (timestamp + skipduration > end) {
                            skipduration = Math.abs(end - timestamp);
                            timestamp = end - skipduration;
                        }
                        if (skipduration <= 0) {
                            renderAnnotationItems(annotations);
                            return;
                        }
                        const existingAnnotation = annotations.find(x => x.timestamp == Math.round(timestamp) && x.id != id);
                        if (existingAnnotation) {
                            addNotification(M.util.get_string('interactionalreadyexists', 'mod_interactivevideo'), 'danger');
                            renderAnnotationItems(annotations);
                            return;
                        }
                        if (targetAnnotation.timestamp == Math.round(timestamp)) {
                            renderAnnotationItems(annotations);
                            return;
                        }
                        targetAnnotation.timestamp = Math.round(timestamp);
                        targetAnnotation.title = Math.round(timestamp) + skipduration;
                        targetAnnotation.status = "draft";
                        dispatchEvent('annotationupdated', {
                            annotation: targetAnnotation,
                            action: 'draft'
                        });
                        await player.seek(Math.round(timestamp)); // Seek to the new position
                        player.pause();
                        $('#scrollbar').css('left', timestamp / end * 100 + '%');
                    }
                });

                $('#video-timeline-wrapper .skipsegment').resizable({
                    'containment': '#video-timeline-wrapper',
                    'handles': 'e, w',
                    'grid': [secondLength, 0],
                    'start': function () {
                        $('#message').remove();
                        appendTimestamp($(this).data('timestamp'));
                        $('#timeline-items').addClass('no-pointer-events');
                    },
                    'resize': async function (event, ui) {
                        let timestamp;
                        if (ui.originalPosition.left != ui.position.left || ui.originalSize.width == ui.size.width) {
                            if (ui.position.left < 0) {
                                ui.position.left = 0;
                            }
                            timestamp = ((ui.position.left) / $('#video-timeline').width()) * totaltime + start;
                        } else {
                            timestamp = ((ui.position.left + ui.size.width) / $('#video-timeline').width()) * totaltime + start;
                        }
                        $('#scrollbar').css('left', timestamp / end * 100 + '%');
                        await player.seek(Math.round(timestamp));
                        player.pause();
                        $('#scrollbar #position').text(convertSecondsToHMS(Math.round(timestamp), true));
                    },
                    'stop': async function (event, ui) {
                        $('#scrollbar #position').remove();
                        setTimeout(function () {
                            $('#timeline-items').removeClass('no-pointer-events');
                        }, 200);
                        const id = $(this).data('id');
                        targetAnnotation = annotations.find(x => x.id == id);
                        let timestamp, direction;
                        if (ui.originalPosition.left != ui.position.left) {
                            if (ui.position.left < 0) {
                                ui.position.left = 0;
                            }
                            timestamp = ((ui.position.left) / $('#video-timeline').width()) * totaltime + start;
                            direction = "left";
                        } else {
                            timestamp = ((ui.position.left + ui.size.width) / $('#video-timeline').width()) * totaltime + start;
                            direction = "right";
                        }
                        const existingAnnotation = annotations.find(x => x.timestamp == Math.round(timestamp) && x.id != id);
                        if (existingAnnotation) {
                            addNotification(M.util.get_string('interactionalreadyexists', 'mod_interactivevideo'), 'danger');
                            renderAnnotationItems(annotations);
                            return;
                        }
                        if (targetAnnotation.timestamp == Math.round(timestamp)) {
                            return;
                        }
                        if (direction == "left") {
                            targetAnnotation.timestamp = Math.round(timestamp);
                        } else {
                            targetAnnotation.title = Math.round(timestamp);
                        }
                        targetAnnotation.status = 'draft';
                        dispatchEvent('annotationupdated', {
                            annotation: targetAnnotation,
                            action: 'draft'
                        });
                        await player.seek(Math.round(timestamp));
                        player.pause();
                        $('#scrollbar').css('left', timestamp / end * 100 + '%');
                    }
                });

                $('#video-timeline-wrapper .skipsegment').on('click', async function (e) {
                    e.preventDefault();
                    const timestamp = $(this).data('timestamp');
                    await player.seek(timestamp);
                    player.pause();
                });

                $('#video-timeline-wrapper .skipsegment .delete-skipsegment').on('click', function (e) {
                    e.preventDefault();
                    const id = $(this).closest('.skipsegment').data('id');
                    $(`tr.annotation[data-id="${id}"] .delete`).trigger('click');
                });
            });

            // Tested
            $('#scrollbar').draggable({
                'containment': '#timeline-items',
                'axis': 'x',
                'handle': '#scrollhead, #scrollline',
                'cursor': 'col-resize',
                'start': function (event, ui) {
                    $('#timeline-items').addClass('no-pointer-events');
                    $("#message").remove();
                    appendTimestamp(Math.round(((ui.position.left) / $('#timeline-items').width()) * totaltime + start));
                },
                'drag': async function (event, ui) {
                    let timestamp = ((ui.position.left) / $('#timeline-items').width()) * totaltime + start;
                    await player.seek(Math.round(timestamp));
                    player.pause();
                    $('#scrollbar #position').text(convertSecondsToHMS(Math.round(timestamp), true));
                },
                'stop': function (event, ui) {
                    $('#scrollbar #position').remove();
                    setTimeout(function () {
                        $('#timeline-items').removeClass('no-pointer-events');
                    }, 200);
                    // Convert the position to percentage
                    let timestamp = ((ui.position.left) / $('#timeline-items').width()) * totaltime + start;
                    $('#scrollbar').css('left', timestamp / end * 100 + '%');
                }
            });

            // Seek bar functionalities
            $('#vseek, #video-timeline, #video-nav .annotation').on('mouseenter', function (e) {
                $('#cursorbar').remove();
                e.preventDefault();
                e.stopImmediatePropagation();
                // First clone the #scrollbar and place it where the cursor is.
                var $scrollbar = $('#scrollbar').clone();
                $scrollbar.attr('id', 'cursorbar');

                const parentOffset = $(this).offset();
                const relX = e.pageX - parentOffset.left;

                $scrollbar.css('left', (relX + 4) + 'px');
                $scrollbar.find('#scrollhead').remove();
                var percentage = relX / $(this).width();
                var time = Math.round(percentage * (totaltime) + start);
                var formattedTime = convertSecondsToHMS(time, true);
                $scrollbar.append(`<div id="position" class="position-absolute bg-dark text-white small rounded-sm p-1"
                     style="top: -30px;">${formattedTime}</div>`);
                $('#timeline-items').append($scrollbar);
            });

            $('#vseek, #video-timeline, #video-nav .annotation').on('mouseleave', function (e) {
                e.stopImmediatePropagation();
                $('#cursorbar').remove();
            });

            $('#vseek, #video-timeline').on('mousemove', function (e) {
                e.stopImmediatePropagation();
                const parentOffset = $(this).offset();
                const relX = e.pageX - parentOffset.left;
                var percentage = relX / $(this).width();
                var time = Math.round(percentage * (totaltime) + start);
                var formattedTime = convertSecondsToHMS(time, true);
                // Move the cursorbar
                $('#cursorbar').css('left', (relX + 4) + 'px');
                $('#cursorbar #position').text(formattedTime);
            });

            $(document).on('click', '#video-nav .annotation', async function (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                var id = $(this).data('id');
                var annotation = annotations.find(x => x.id == id);
                await player.seek(annotation.timestamp);
                runInteraction(annotation);
            });

            $(document).on('click', '#vseek, #video-timeline', async function (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                var percentage = e.offsetX / $(this).width();
                replaceProgressBars(percentage * 100);
                await player.seek(Math.round((percentage * totaltime) + start));
                player.pause();
                $("#message, #end-screen").remove();
            });

            $('#zoomout').on('click', function () {
                let currentLevel = $('#timeline-items-wrapper').css('width'); // In px.
                let newLevel = parseInt(currentLevel) - 300;
                $('#timeline-items-wrapper').css('width', newLevel + 'px');
                let timelineElement = document.getElementById('timeline');
                if (timelineElement.scrollWidth <= timelineElement.clientWidth) {
                    $(this).attr('disabled', 'disabled');
                }
                dispatchEvent('annotationitemsrendered', { 'annotations': annotations });
            });

            $("#timeline").on('wheel', function (e) {
                if (!e.shiftKey) {
                    if (e.originalEvent.deltaY < 0) {
                        $('#zoomin').trigger('click');
                    } else {
                        $('#zoomout').trigger('click');
                    }
                }
            });

            $('#zoomin').on('click', function () {
                let currentLevel = $('#timeline-items-wrapper').css('width'); // In px.
                let newLevel = parseInt(currentLevel) + 300;
                $('#timeline-items-wrapper').css('width', newLevel + 'px');
                $('#zoomout').removeAttr('disabled');
                dispatchEvent('annotationitemsrendered', { 'annotations': annotations });
            });

            $('#savedraft').on('click', function (e) {
                e.stopImmediatePropagation();
                let draftAnnotations = annotations.filter(x => x.status == 'draft');
                let count = 0;
                draftAnnotations.forEach(function (a) {
                    $.ajax({
                        url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                        method: "POST",
                        dataType: "text",
                        data: {
                            action: 'quickeditfield',
                            sesskey: M.cfg.sesskey,
                            id: a.id,
                            field: 'timestamp',
                            contextid: M.cfg.contextid,
                            value: a.timestamp,
                        },
                        success: function (data) {
                            var updated = JSON.parse(data);
                            dispatchEvent('annotationupdated', {
                                annotation: updated,
                                action: 'savedraft'
                            });
                        }
                    });
                    if (a.type == 'skipsegment') {
                        $.ajax({
                            url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                            method: "POST",
                            dataType: "text",
                            data: {
                                action: 'quickeditfield',
                                sesskey: M.cfg.sesskey,
                                id: a.id,
                                field: 'title',
                                contextid: M.cfg.contextid,
                                value: a.title,
                            },
                            success: function (data) {
                                var updated = JSON.parse(data);
                                dispatchEvent('annotationupdated', {
                                    annotation: updated,
                                    action: 'savedraft'
                                });
                            }
                        });
                    }
                    count++;
                    if (count == draftAnnotations.length) {
                        addNotification(M.util.get_string('draftsaved', 'mod_interactivevideo'), 'success');
                    }
                });

            });

            $('#addcontent').on('click', async function (e) {
                e.preventDefault();
                if (!playerReady) {
                    return;
                }
                const currentTime = await player.getCurrentTime();
                if (annotations.find(x => x.timestamp == currentTime)) {
                    addNotification(M.util.get_string('interactionalreadyexists', 'mod_interactivevideo'), 'danger');
                    return;
                }
                // Check skip segments
                const skipsegments = annotations.filter(x => x.type == 'skipsegment');
                const skip = skipsegments.find(x => Number(x.timestamp) < Number(currentTime)
                    && Number(x.title) > Number(currentTime));
                if (skip) {
                    addNotification(M.util.get_string('interactionisbetweentheskipsegment', 'mod_interactivevideo'), 'danger');
                    return;
                }
                $('#contentmodal').modal('show');
            });

            $('#player-region').resizable({
                'containment': 'parent',
                'handles': 'e',
                'grid': [10, 10],
            });

            $('#interaction-region').resizable({
                'containment': 'parent',
                'handles': 'e',
                'grid': [10, 10],
            });

            window.addEventListener('beforeunload', (e) => {
                if (annotations.find(x => x.status == 'draft')) {
                    const confirmationMessage = M.util.get_string('unsavedchanges', 'mod_interactivevideo');
                    e.returnValue = confirmationMessage;
                    return confirmationMessage;
                }
            });

        }
    };
});