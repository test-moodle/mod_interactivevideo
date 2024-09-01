<?php
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
 * Utility functions for interactivevideo module
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class interactivevideo_util {

    /**
     * Get all interactions in one interactive video module.
     *
     * @param int $interactivevideo
     * @param int $contextid
     * @return array
     */
    public static function get_items($interactivevideo, $contextid, $hascompletion = false) {
        global $DB, $PAGE;
        $PAGE->set_context(context::instance_by_id($contextid));
        $filter = ['annotationid' => $interactivevideo];
        if ($hascompletion) {
            $filter['hascompletion'] = 1;
        }
        $records = $DB->get_records('interactivevideo_items', $filter);
        foreach ($records as $key => $record) {
            $records[$key]->formattedtitle = format_string($records[$key]->title);
        }
        return $records;
    }

    /**
     * Get one interaction by id.
     *
     * @param int $id
     * @param int $contextid
     * @return stdClass
     */
    public static function get_item($id, $contextid) {
        global $DB, $PAGE;
        $PAGE->set_context(context::instance_by_id($contextid));
        $record = $DB->get_record('interactivevideo_items', ['id' => $id]);
        $record->formattedtitle = format_string($record->title);
        return $record;
    }

    /**
     * Copy an interaction.
     *
     * @param int $id
     * @param int $contextid
     * @return stdClass
     */
    public static function copy_item($id, $contextid) {
        global $DB, $CFG;
        $record = $DB->get_record('interactivevideo_items', ['id' => $id]);
        $record->title = $record->title . ' (copy)';
        $record->id = $DB->insert_record('interactivevideo_items', $record);
        // Handle related files "content" field.
        require_once($CFG->libdir . '/filelib.php');
        $fs = get_file_storage();
        $files = $fs->get_area_files($contextid, 'mod_interactivevideo', 'content', $id, 'id ASC', false);
        foreach ($files as $file) {
            $filerecord = ['itemid' => $record->id];
            $fs->create_file_from_storedfile($filerecord, $file);
        }
        return self::get_item($record->id, $contextid);
    }

    /**
     * Format content.
     *
     * @param mixed $content
     * @param string $format
     * @param int $contextid
     * @return mixed
     */
    public static function format_content($content, $format, $contextid) {
        global $PAGE;
        $context = context::instance_by_id($contextid);
        $PAGE->set_context($context);
        return format_text($content, $format, ['noclean' => true, 'overflowdiv' => false, 'context' => $context]);
    }

    /**
     * Get progress data per user.
     *
     * @param int $interactivevideo
     * @param int $userid
     * @return stdClass
     */
    public static function get_progress($interactivevideo, $userid) {
        global $DB;
        if ($userid == 1) {
            global $SESSION;
            $progress = $SESSION->ivprogress;
            if (!isset($progress)) {
                $SESSION->ivprogress = [];
            }
            if (isset($progress[$interactivevideo])) {
                return $progress[$interactivevideo];
            } else {
                $SESSION->ivprogress[$interactivevideo] = [
                    'cmid' => $interactivevideo,
                    'completeditems' => '',
                    'xp' => 0,
                ];
            }
            return $SESSION->ivprogress[$interactivevideo];
        }

        $record = $DB->get_record('interactivevideo_completion', ['cmid' => $interactivevideo, 'userid' => $userid]);
        if (!$record) {
            $record = new stdClass();
            $record->cmid = $interactivevideo;
            $record->userid = $userid;
            $record->timecreated = time();
            $record->timecompleted = 0;
            $record->completeditems = '[]';
            $record->completionpercentage = 0;
            $record->id = $DB->insert_record('interactivevideo_completion', $record);
        }
        return $record;
    }

    /**
     * Save progress data.
     *
     * @param int $interactivevideo
     * @param int $userid
     * @param mixed $completeditems
     * @param int $completed
     * @param int $percentage
     * @param int $grade
     * @param int $gradeiteminstance
     * @param int $xp
     * @return mixed
     */
    public static function save_progress(
        $interactivevideo,
        $userid,
        $completeditems,
        $completed = 0,
        $percentage = 0,
        $grade = 0,
        $gradeiteminstance = 0,
        $xp = 0
    ) {
        global $DB, $CFG, $SESSION;
        // If guess user, save progress in the session; otherwise in the database.
        if ($userid == 1) {
            $SESSION->ivprogress[$interactivevideo] = [
                'cmid' => $interactivevideo,
                'completeditems' => $completeditems,
                'completed' => $completed,
                'percentage' => $percentage,
                'xp' => $xp,
            ];
            return $SESSION->ivprogress[$interactivevideo];
        }
        $record = $DB->get_record('interactivevideo_completion', ['cmid' => $interactivevideo, 'userid' => $userid]);
        $record->completeditems = $completeditems;
        $record->timecompleted = $completed > 0 ? time() : 0;
        $record->completionpercentage = $percentage;
        $record->xp = $xp;
        $DB->update_record('interactivevideo_completion', $record);

        // Update completion state.
        $cm = get_coursemodule_from_instance('interactivevideo', $interactivevideo);
        if ($cm->completion == 2) {
            require_once($CFG->libdir . '/completionlib.php');
            $course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
            $completion = new completion_info($course);
            if ($completed) {
                $completion->update_state($cm, COMPLETION_COMPLETE, $userid);
            } else {
                $completion->update_state($cm, COMPLETION_INCOMPLETE, $userid);
            }
        }

        // Update grade.
        require_once($CFG->libdir . '/gradelib.php');
        $gradeitem = new stdClass();
        $gradeitem->userid = $userid;
        $gradeitem->rawgrade = $grade;

        grade_update('mod/interactivevideo', $cm->course, 'mod', 'interactivevideo', $gradeiteminstance, 0, $gradeitem);

        $record->grade = $grade;
        $record->gradeiteminstance = $gradeiteminstance;
        $record->gradeitem = $gradeitem;
        return $record;
    }

    /**
     * Get completion data by group for report.
     *
     * @param int $interactivevideo
     * @param int $group
     * @param int $contextid
     * @return array
     */
    public static function get_report_data_by_group($interactivevideo, $group, $contextid) {
        global $DB, $OUTPUT, $COURSE, $PAGE;
        $context = context::instance_by_id($contextid);
        $PAGE->set_context($context);
        // Get fields for userpicture.
        $fields = \core_user\fields::get_picture_fields();
        $fields = 'u.' . implode(', u.', $fields);
        if ($group == 0) {
            // Get all enrolled users (student only).
            $sql = "SELECT " . $fields . ", ac.timecompleted, ac.timecreated,
             ac.completionpercentage, ac.completeditems, ac.xp
                    FROM {user} u
                    LEFT JOIN {interactivevideo_completion} ac ON ac.userid = u.id AND ac.cmid = :cmid
                    WHERE u.id IN (SELECT userid FROM {role_assignments} WHERE contextid = :contextid AND roleid = 5)
                    ORDER BY u.lastname, u.firstname";
            $records = $DB->get_records_sql($sql, ['cmid' => $interactivevideo, 'contextid' => $contextid]);
        } else {
            // Get users in group (student only).
            $sql = "SELECT " . $fields . ", ac.timecompleted, ac.timecreated,
             ac.completionpercentage, ac.completeditems, ac.xp
                    FROM {user} u
                    LEFT JOIN {interactivevideo_completion} ac ON ac.userid = u.id AND ac.cmid = :cmid
                    WHERE u.id IN (SELECT userid FROM {groups_members} WHERE groupid = :groupid)
                    ORDER BY u.lastname, u.firstname";
            $records = $DB->get_records_sql($sql, ['cmid' => $interactivevideo, 'groupid' => $group]);
        }

        // Render the photo of the user.
        foreach ($records as $record) {
            $record->picture = $OUTPUT->user_picture($record, [
                'size' => 35,
                'courseid' => $COURSE->id,
                'link' => true,
                'includefullname' => true,
            ]);
        }
        return $records;
    }

    /**
     * Get all activity types.
     *
     * @return array
     */
    public static function get_all_activitytypes() {
        $subplugins = get_config('mod_interactivevideo', 'enablecontenttypes');
        $subplugins = explode(',', $subplugins);
        $contentoptions = [];
        foreach ($subplugins as $subplugin) {
            $class = "ivplugin_" . $subplugin . "\\main";

            if (!class_exists($class)) {
                continue;
            }

            $contenttype = new $class();
            if ($contenttype && $contenttype->can_used() && $contenttype->get_property()) {
                if ($contenttype->can_used()) {
                    $properties = $contenttype->get_property();
                    if (
                        !isset($properties['name']) || !isset($properties['class'])
                        || !isset($properties['amdmodule']) || !isset($properties['form'])
                    ) {
                        return;
                    }
                    if (!isset($properties['hascompletion'])) {
                        $properties['hascompletion'] = false;
                    }
                    if (!isset($properties['hastimestamp'])) {
                        $properties['hastimestamp'] = true;
                    }
                    if (!isset($properties['allowmultiple'])) {
                        $properties['allowmultiple'] = true;
                    }
                    if (!isset($properties['icon'])) {
                        $properties['icon'] = 'bi bi-cursor';
                    }
                    if (!isset($properties['title'])) {
                        $properties['title'] = get_string('unknowncontenttype', 'mod_interactivevideo');
                    }
                    if (!isset($properties['description'])) {
                        $properties['description'] = '';
                    }
                    $contentoptions[] = $properties;
                }
            }
        }
        return $contentoptions;
    }

    /**
     * Quick edit field.
     *
     * @param int $id
     * @param string $field
     * @param string $value
     * @param int $contextid
     * @param int $olddraftitemid
     * @return stdClass
     */
    public static function quick_edit_field($id, $field, $value, $contextid, $olddraftitemid = 0) {
        global $DB, $PAGE, $CFG;
        $context = context::instance_by_id($contextid);
        $PAGE->set_context($context);
        if ($field == 'content') { // Inline annnotation contenttype.
            require_once($CFG->libdir . '/filelib.php');
            // Delete the old files before saving the new files.
            $fs = get_file_storage();
            $fs->delete_area_files($context->id, 'mod_interactivevideo', 'content', $id);
            $draftitemid = file_get_submitted_draft_itemid('content');
            $postvalue = file_save_draft_area_files(
                $draftitemid,
                $contextid,
                'mod_interactivevideo',
                'content',
                $id,
                [
                    'maxfiles' => -1,
                    'maxbytes' => 0,
                    'trusttext' => true,
                    'noclean' => true, // Don't clean the text, keep it as it is.
                    'context' => $context,
                ],
                $value
            );

            // Remove orphaned files.
            self::file_remove_editor_orphaned_files($draftitemid, $value);
            self::file_remove_editor_orphaned_files($olddraftitemid, $value);
            // Replace < and > with &lt; and &gt; to prevent XSS.
            $value = $postvalue;
        }
        $DB->set_field('interactivevideo_items', $field, $value, ['id' => $id]);
        $record = $DB->get_record('interactivevideo_items', ['id' => $id]);
        $record->formattedtitle = format_string($record->title);
        return $record;
    }

    /**
     * Remove orphaned files.
     *
     * @param int $draftid
     * @param string $text
     * @return void
     */
    public static function file_remove_editor_orphaned_files($draftid, $text) {
        global $CFG, $USER;

        // Find those draft files included in the text, and generate their hashes.
        $context = context_user::instance($USER->id);
        $baseurl = $CFG->wwwroot . '/draftfile.php/' . $context->id . '/user/draft/' . $draftid . '/';
        $pattern = "/" . preg_quote($baseurl, '/') . "(.+?)[\?\"'<>\s:\\\\]/";
        preg_match_all($pattern, $text, $matches);
        $usedfilehashes = [];
        foreach ($matches[1] as $matchedfilename) {
            $matchedfilename = urldecode($matchedfilename);
            $usedfilehashes[] = \file_storage::get_pathname_hash(
                $context->id,
                'user',
                'draft',
                $draftid,
                '/',
                $matchedfilename
            );
        }

        // Now, compare the hashes of all draft files, and remove those which don't match used files.
        $fs = get_file_storage();
        $files = $fs->get_area_files($context->id, 'user', 'draft', $draftid, 'id', false);
        foreach ($files as $file) {
            $tmphash = $file->get_pathnamehash();
            if (!in_array($tmphash, $usedfilehashes)) {
                $file->delete();
            }
        }
    }

    /**
     * Save log.
     *
     * @param int $interactionid
     * @param int $courseid
     * @param int $userid
     * @param int $activityid
     * @param string $log
     * @return int
     */
    public static function save_log($interactionid, $courseid, $userid, $activityid, $log) {
        global $DB, $USER;
        $record = new stdClass();
        $record->interactionid = $interactionid;
        $record->courseid = $courseid;
        $record->userid = $userid ?? $USER->id;
        $record->cmid = $activityid;
        $record->text1 = $log;
        $record->timecreated = time();
        $id = $DB->insert_record('interactivevideo_log', $record);
        return $id;
    }

    /**
     * Get log.
     *
     * @param int $userid
     * @param int $cmid
     * @param int $annotationid
     * @param int $contextid
     * @return stdClass
     */
    public static function get_log($userid, $cmid, $annotationid, $contextid) {
        global $DB, $CFG;
        require_once($CFG->libdir . '/filelib.php');

        $record = $DB->get_record('interactivevideo_log', ['userid' => $userid, 'cmid' => $cmid, 'annotationid' => $annotationid]);
        if ($record) {
            $record->text1 = file_rewrite_pluginfile_urls(
                str_replace('\\/', '/', $record->text1),
                'pluginfile.php',
                $contextid,
                'mod_interactivevideo',
                'text1',
                $record->id
            );
            $record->text2 = file_rewrite_pluginfile_urls(
                str_replace('\\/', '/', $record->text2),
                'pluginfile.php',
                $contextid,
                'mod_interactivevideo',
                'text2',
                $record->id
            );
            $record->text3 = file_rewrite_pluginfile_urls(
                str_replace('\\/', '/', $record->text3),
                'pluginfile.php',
                $contextid,
                'mod_interactivevideo',
                'text3',
                $record->id
            );
        }
        return $record;
    }

    /**
     * Get logs by userids.
     *
     * @param array $userids
     * @param int $annotationid
     * @param int $contextid
     * @return array
     */
    public static function get_logs_by_userids($userids, $annotationid, $contextid) {
        global $DB, $CFG;
        require_once($CFG->libdir . '/filelib.php');
        $inparams = $DB->get_in_or_equal($userids)[1];
        $inparams = implode(',', $inparams);
        $sql = "SELECT * FROM {interactivevideo_log} WHERE annotationid = ? AND userid IN ($inparams) ORDER BY
        timecreated DESC";
        $records = $DB->get_records_sql($sql, [$annotationid]);
        foreach ($records as $record) {
            $record->formattedtimecreated = userdate($record->timecreated, get_string('strftimedatetime'));
            $record->formattedtimemodified = userdate($record->timemodified, get_string('strftimedatetime'));
            $record->text1 = file_rewrite_pluginfile_urls(
                str_replace('\\/', '/', $record->text1),
                'pluginfile.php',
                $contextid,
                'mod_interactivevideo',
                'text1',
                $record->id
            );
            $record->text2 = file_rewrite_pluginfile_urls(
                str_replace('\\/', '/', $record->text2),
                'pluginfile.php',
                $contextid,
                'mod_interactivevideo',
                'text2',
                $record->id
            );
            $record->text3 = file_rewrite_pluginfile_urls(
                str_replace('\\/', '/', $record->text3),
                'pluginfile.php',
                $contextid,
                'mod_interactivevideo',
                'text3',
                $record->id
            );
        }
        return array_values($records);
    }
}
