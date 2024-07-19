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
    if ($oldversion < 2024071403) {
        // Define table interactivevideo_items to be renamed to NEWNAMEGOESHERE.
        $table = new xmldb_table('annotationitems');

        // Launch rename table for interactivevideo_items.
        $dbman->rename_table($table, 'interactivevideo_items');

        $table = new xmldb_table('annotation_log');
        // Launch rename table for interactivevideo_items.
        $dbman->rename_table($table, 'interactivevideo_log');

        $table = new xmldb_table('annotation_completion');
        // Launch rename table for interactivevideo_items.
        $dbman->rename_table($table, 'interactivevideo_completion');

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2024071403, 'interactivevideo');
    }

    if ($oldversion < 2024071410) {

        // Define table interactivevideo_accesstoken to be created.
        $table = new xmldb_table('interactivevideo_accesstoken');

        // Adding fields to table interactivevideo_accesstoken.
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('usermodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('token', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL, null, '0');

        // Adding keys to table interactivevideo_accesstoken.
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_key('usermodified', XMLDB_KEY_FOREIGN, ['usermodified'], 'user', ['id']);

        // Conditionally launch create table for interactivevideo_accesstoken.
        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2024071410, 'interactivevideo');
    }
    return true;
}
