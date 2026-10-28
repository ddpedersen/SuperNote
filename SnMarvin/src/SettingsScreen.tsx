/**
 * Settings: enter/test/save the Anthropic API key and Marvin token.
 * Black-on-white, large touch targets, for e-ink.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  DEFAULT_MODEL,
  DEFAULT_TITLE_SUFFIX,
  ensurePermission,
  loadSettings,
  readConfigFile,
  saveSettings,
  type Config,
} from './config';
import {checkKey} from './claude';
import {checkToken} from './marvin';
import {logError} from './log';

type Props = {
  /** True when a send is waiting on these settings. */
  resuming: boolean;
  onSaved: () => void;
  onCancel: () => void;
};

const EMPTY: Config = {
  anthropicApiKey: '',
  marvinApiToken: '',
  model: DEFAULT_MODEL,
  titleSuffix: DEFAULT_TITLE_SUFFIX,
};

function Field(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
  revealed?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChange}
        secureTextEntry={props.secret && !props.revealed}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />
    </View>
  );
}

function Button({label, onPress, disabled}: {label: string; onPress: () => void; disabled?: boolean}) {
  return (
    <Pressable
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={disabled ? undefined : onPress}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen({resuming, onSaved, onCancel}: Props) {
  const [form, setForm] = useState<Config>(EMPTY);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const update = (key: keyof Config) => (value: string) =>
    setForm(f => ({...f, [key]: value}));

  useEffect(() => {
    loadSettings()
      .then(setForm)
      .catch(e => {
        logError('load settings', e);
        setMessages([e instanceof Error ? e.message : String(e)]);
      });
  }, []);

  const run = async (task: () => Promise<string[] | void>) => {
    setBusy(true);
    setMessages(['Working…']);
    try {
      setMessages((await task()) ?? []);
    } catch (e) {
      logError('settings', e);
      setMessages([`✗ ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setBusy(false);
    }
  };

  const test = () =>
    run(async () => {
      if (!(await ensurePermission('plugin.permission.INTERNET'))) {
        return ['✗ Network access was denied.'];
      }
      return Promise.all([
        form.anthropicApiKey.trim()
          ? checkKey(form.anthropicApiKey.trim(), form.model.trim() || DEFAULT_MODEL)
          : '✗ Enter an Anthropic API key',
        form.marvinApiToken.trim()
          ? checkToken(form.marvinApiToken.trim())
          : '✗ Enter a Marvin API token',
      ]);
    });

  const importFile = () =>
    run(async () => {
      const file = await readConfigFile();
      if (!file) {
        return ['✗ No MyStyle/SnMarvin/config.json found.'];
      }
      setForm(file);
      return ['Loaded config.json. Tap Save to keep it, then you can delete the file.'];
    });

  const save = () =>
    run(async () => {
      await saveSettings(form);
      onSaved();
    });

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Settings</Text>
      {resuming && (
        <Text style={styles.hint}>Add your keys to finish sending. Your selection is kept.</Text>
      )}

      <Field
        label="Anthropic API key"
        hint="console.anthropic.com → API keys (starts with sk-ant-)"
        value={form.anthropicApiKey}
        onChange={update('anthropicApiKey')}
        secret
        revealed={revealed}
      />
      <Field
        label="Marvin API token"
        hint="Marvin → Settings → API → API Token"
        value={form.marvinApiToken}
        onChange={update('marvinApiToken')}
        secret
        revealed={revealed}
      />
      <Pressable onPress={() => setRevealed(!revealed)} hitSlop={12}>
        <Text style={styles.link}>{revealed ? 'Hide keys' : 'Show keys'}</Text>
      </Pressable>

      <Field label="Claude model" value={form.model} onChange={update('model')} />
      <Field
        label="Add to each task title"
        hint="Marvin shortcuts, e.g. +today or #Project. Leave blank for none."
        value={form.titleSuffix}
        onChange={update('titleSuffix')}
      />

      {messages.map((m, i) => (
        <Text key={i} style={styles.message}>
          {m}
        </Text>
      ))}

      <View style={styles.row}>
        <Button label="Test" onPress={test} disabled={busy} />
        <Button label={resuming ? 'Save & send' : 'Save'} onPress={save} disabled={busy} />
        <Button label="Cancel" onPress={onCancel} disabled={busy} />
      </View>
      <Pressable onPress={busy ? undefined : importFile} hitSlop={12}>
        <Text style={styles.link}>Import from MyStyle/SnMarvin/config.json</Text>
      </Pressable>
      <Text style={styles.hint}>
        Keys are stored on this device in MyStyle/SnMarvin/settings.note and only sent to
        Anthropic and Marvin.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: {fontSize: 36, fontWeight: '700', color: '#000000', marginBottom: 16, marginRight: 40},
  field: {marginBottom: 20},
  label: {fontSize: 28, fontWeight: '600', color: '#000000'},
  hint: {fontSize: 22, color: '#000000', marginTop: 4, marginBottom: 8},
  input: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    fontSize: 26,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#000000',
  },
  link: {fontSize: 24, color: '#000000', textDecorationLine: 'underline', marginVertical: 12},
  message: {fontSize: 26, color: '#000000', marginBottom: 8},
  row: {flexDirection: 'row', justifyContent: 'center', marginTop: 16, flexWrap: 'wrap'},
  button: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 36,
    margin: 8,
  },
  buttonDisabled: {borderColor: '#9d9d9d'},
  buttonText: {fontSize: 30, fontWeight: '600', color: '#000000'},
});
