/**
 * Instructions: how each option behaves, keys, costs and troubleshooting.
 * Opened from the note menu and from Settings.
 *
 * @format
 */

import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

type Section = {heading: string; lines: string[]};

const SECTIONS: Section[] = [
  {
    heading: 'What it does',
    lines: [
      'Turns handwritten to-dos into tasks in your task app (Amazing Marvin or Todoist), using the AI you choose (Claude or OpenAI). Pick both once in Settings.',
    ],
  },
  {
    heading: 'Sidebar: AI Task Export',
    lines: [
      'This page, Whole note and Choose pages: the AI finds every To Do in what you send. It looks for checkboxes, bullets, "todo" and action phrases, and skips plain notes and anything checked off or crossed out.',
      'Choose pages takes ranges like 1-3, 5, 8-10.',
      'More than 10 pages: you are asked first, with a time and cost estimate. Pages go 5 at a time; tasks already added are kept if a later batch fails.',
    ],
  },
  {
    heading: 'Marked headings',
    lines: [
      'To mark an item: lasso it, tap H (heading) and choose the diagonal-line style.',
      'The AI finds all tasks, but only from text inside those headings, across the whole note. A heading can hold more than one task.',
      'The tablet reads the heading handwriting itself and sends text, so this is the fastest and cheapest option.',
    ],
  },
  {
    heading: 'Lasso: Export Tasks',
    lines: [
      'Lasso exactly what you want and tap Export Tasks in the lasso toolbar. Everything you select becomes a task, even if it is not worded like one, and nothing else on the page is sent.',
      'Your wording is kept, including places, times and names. Only a date word like "today" or "Fri" becomes the due date. A lassoed list becomes one task per line.',
      'Best for adding one more item from a page you already exported, without creating duplicates.',
      'In PDFs, select text and tap Export Tasks the same way.',
    ],
  },
  {
    heading: 'Due dates and duplicates',
    lines: [
      'A date written next to a task becomes its due date. Otherwise Marvin uses the title text from Settings (+today by default) and Todoist uses the default due ("today").',
      'A time written with a task (e.g. "2pm") is set as the task time so you get a reminder: Marvin and Todoist get a reminder 30 minutes before (Todoist free plans remind at the due time instead). Turn this off in Settings → Create reminders from task times; the time is then kept in the note. A time with no date means today.',
      'Sending the same page twice creates the tasks twice. Use lasso for later additions.',
      'The result screen lists each task with its due date and note.',
    ],
  },
  {
    heading: 'Keys and costs',
    lines: [
      'You need one AI key (Anthropic or OpenAI API key) and your task app token. Enter them in Settings and tap Test, or use a key file (Settings → Key file format) placed anywhere in MyStyle.',
      'AI use is billed to your own API account: roughly 1 cent per page with Claude Opus 5.5, less for lasso and marked headings. A Claude or ChatGPT subscription does not cover API use.',
      'Keys stay on this device and each one is only sent to its own service.',
      'Saving from the plugin list (gear) holds keys in memory until you use the plugin once in a note. Do that before restarting.',
    ],
  },
  {
    heading: 'If something goes wrong',
    lines: [
      'Tap Show details: it lists every step of the last send. A photo of it is usually enough to find the problem.',
      'Key rejected: create a new key and enter it in Settings (keys can expire).',
      'Settings can only be saved with a note open, not from a PDF.',
    ],
  },
];

export default function HelpScreen({onBack}: {onBack: () => void}) {
  return (
    <>
      <ScrollView>
        <Text style={styles.title}>Instructions</Text>
        {SECTIONS.map(section => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.lines.map((line, i) => (
              <Text key={i} style={styles.line}>
                • {line}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
      <View style={styles.row}>
        <Pressable style={styles.button} onPress={onBack}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  title: {fontSize: 32, fontWeight: '700', color: '#000000', marginBottom: 12, marginRight: 40},
  section: {marginBottom: 16},
  heading: {fontSize: 25, fontWeight: '700', color: '#000000', marginBottom: 4},
  line: {fontSize: 21, lineHeight: 29, color: '#000000', marginBottom: 4},
  row: {flexDirection: 'row', justifyContent: 'center', marginTop: 12},
  button: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  buttonText: {fontSize: 26, fontWeight: '600', color: '#000000'},
});
