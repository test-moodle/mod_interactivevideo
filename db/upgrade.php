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
 * Upgrade steps for Interactivevideo
 *
 * Documentation: {@link https://moodledev.io/docs/guides/upgrade}
 *
 * @package    mod_interactivevideo
 * @category   upgrade
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Execute the plugin upgrade steps from the given old version.
 *
 * @param int $oldversion
 * @return bool
 */
function xmldb_interactivevideo_upgrade($oldversion) {
    global $DB;
    $dbman = $DB->get_manager();
    if ($oldversion < 2024071416) {

        // Define field completionid to be added to interactivevideo_log.
        $table = new xmldb_table('interactivevideo_log');
        $field = new xmldb_field('completionid', XMLDB_TYPE_INTEGER, '20', null, null, null, null, 'annotationid');

        // Conditionally launch add field completionid.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $key = new xmldb_key('completionid', XMLDB_KEY_FOREIGN, ['completionid'], 'interactivevideo_completion', ['id']);

        // Launch add key completionid.
        $dbman->add_key($table, $key);

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2024071416, 'interactivevideo');
    }

    if ($oldversion < 2024092200) {

        // Define field posterimage to be added to interactivevideo.
        $table = new xmldb_table('interactivevideo');
        $field = new xmldb_field('posterimage', XMLDB_TYPE_TEXT, null, null, null, null, null, 'displayoptions');

        // Conditionally launch add field posterimage.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2024092200, 'interactivevideo');
    }
    if ($oldversion < 2024092202) {

        // Rename field ctxid on table interactivevideo_items to NEWNAMEGOESHERE.
        $table = new xmldb_table('interactivevideo_items');
        $field = new xmldb_field('ctxid', XMLDB_TYPE_INTEGER, '20', null, null, null, null, 'text3');

        // Launch rename field ctxid.
        $dbman->rename_field($table, $field, 'contextid');

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2024092202, 'interactivevideo');
    }
    if ($oldversion < 2024092203) {

        // Define field requiremintime to be added to interactivevideo_items.
        $table = new xmldb_table('interactivevideo_items');
        $field = new xmldb_field('requiremintime', XMLDB_TYPE_INTEGER, '20', null, null, null, null, 'contextid');

        // Conditionally launch add field requiremintime.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2024092203, 'interactivevideo');
    }
    return true;
}
