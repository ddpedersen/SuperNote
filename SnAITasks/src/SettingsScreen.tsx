/**
 * Settings: pick the AI service and task app, then enter/test/save their keys.
 * Black-on-white, large touch targets, for e-ink.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  ensurePermission,
  hasPendingSave,
  isStoreUnreadable,
  loadSettings,
  KEY_FILE_TEMPLATE,
  keyFilePath,
  readConfigFile,
  missingKeys,
  normalize,
  saveSettings,
  type AiProviderId,
  type Config,
  type TaskAppId,
} from './config';
import {AI_PROVIDERS, aiFor, TASK_APPS, taskAppFor} from './providers';
import {logError} from './log';

type Props = {
  /** True when a send is waiting on these settings. */
  resuming: boolean;
  /** Opened from the plugin-list gear: no note is open, so saving is deferred. */
  fromGear: boolean;
  onSaved: (result: 'saved' | 'deferred') => void;
  onCancel: () => void;
};

const EMPTY: Config = normalize({});

/** Dropdown: shows the current choice; tap to list the options. */
function Select<T extends string>(props: {
  label: string;
  value: T;
  options: {value: T; label: string}[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = props.options.find(o => o.value === props.value);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
      <Pressable style={styles.select} onPress={() => setOpen(!open)}>
        <Text style={styles.selectText}>{current?.label ?? props.value}</Text>
        <Text style={styles.selectText}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open &&
        props.options.map(o => (
          <Pressable
            key={o.value}
            style={[styles.selectOption, o.value === props.value && styles.selectOptionOn]}
            onPress={() => {
              props.onChange(o.value);
              setOpen(false);
            }}>
            <Text style={[styles.selectText, o.value === props.value && styles.selectTextOn]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
    </View>
  );
}

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

export default function SettingsScreen({resuming, fromGear, onSaved, onCancel}: Props) {
  const [form, setForm] = useState<Config>(EMPTY);
  const [revealed, setRevealed] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const update = (key: keyof Config) => (value: string) =>
    setForm(f => ({...f, [key]: value}));

  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    loadSettings()
      .then(loaded => {
        setForm(loaded);
        if (hasPendingSave()) {
          setNotice(
            'Your keys are not saved yet. Open any note and use the plugin once to save them before restarting your device.',
          );
        } else if (isStoreUnreadable()) {
          setNotice(
            "Saved keys can't be shown here because no note is open. Entering keys here replaces them.",
          );
        }
      })
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

  const checkBoth = async (): Promise<string[]> => {
    if (!(await ensurePermission('plugin.permission.INTERNET'))) {
      return ['✗ Network access was denied.'];
    }
    const config = normalize(form);
    const missing = missingKeys(config);
    if (missing.length) {
      return missing.map(m => `✗ Enter your ${m}`);
    }
    const ai = aiFor(config);
    return Promise.all([
      ai.checkKey(ai.apiKey(config), ai.model(config)),
      taskAppFor(config).checkToken(config),
    ]);
  };

  const test = () => run(checkBoth);

  const importFile = () =>
    run(async () => {
      const file = await readConfigFile();
      if (!file) {
        return ['✗ No key file found in MyStyle. Tap "Key file format" below for how to make one.'];
      }
      setForm(file);
      return [`Loaded ${keyFilePath ?? 'key file'}. Tap Save to keep the keys, then you can delete the file.`];
    });

  const save = () =>
    run(async () => {
      if (fromGear) {
        // Only claim "keys valid" (and hold them in memory) if both checks pass.
        const results = await checkBoth();
        if (results.some(r => !r.startsWith('✓'))) {
          return [...results, 'Not saved. Fix the key above and tap Save again.'];
        }
      }
      onSaved(await saveSettings(form, fromGear));
    });

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Settings</Text>
      {resuming && (
        <Text style={styles.hint}>Add your keys to finish sending. Your selection is kept.</Text>
      )}
      {notice && <Text style={styles.notice}>{notice}</Text>}

      <Select<AiProviderId>
        label="AI service"
        value={form.aiProvider}
        options={(Object.keys(AI_PROVIDERS) as AiProviderId[]).map(id => ({
          value: id,
          label: AI_PROVIDERS[id].label,
        }))}
        onChange={v => setForm(f => ({...f, aiProvider: v}))}
      />
      {form.aiProvider === 'anthropic' ? (
        <>
          <Field
            label={AI_PROVIDERS.anthropic.keyLabel}
            hint={AI_PROVIDERS.anthropic.keyHint}
            value={form.anthropicApiKey}
            onChange={update('anthropicApiKey')}
            secret
            revealed={revealed}
          />
          <Field label="Claude model" value={form.anthropicModel} onChange={update('anthropicModel')} />
        </>
      ) : (
        <>
          <Field
            label={AI_PROVIDERS.openai.keyLabel}
            hint={AI_PROVIDERS.openai.keyHint}
            value={form.openaiApiKey}
            onChange={update('openaiApiKey')}
            secret
            revealed={revealed}
          />
          <Field
            label="OpenAI model"
            hint="Any model that reads images and supports structured outputs. Tap Test to check it."
            value={form.openaiModel}
            onChange={update('openaiModel')}
          />
        </>
      )}

      <Select<TaskAppId>
        label="Task app"
        value={form.taskApp}
        options={(Object.keys(TASK_APPS) as TaskAppId[]).map(id => ({
          value: id,
          label: TASK_APPS[id].label,
        }))}
        onChange={v => setForm(f => ({...f, taskApp: v}))}
      />
      {form.taskApp === 'marvin' ? (
        <>
          <Field
            label="Marvin API token"
            hint="Marvin → Settings → API → API Token"
            value={form.marvinApiToken}
            onChange={update('marvinApiToken')}
            secret
            revealed={revealed}
          />
          <Field
            label="Add to each task title"
            hint="Marvin shortcuts, e.g. +today or #Project. Leave blank for none."
            value={form.titleSuffix}
            onChange={update('titleSuffix')}
          />
        </>
      ) : (
        <>
          <Field
            label="Todoist API token"
            hint="Todoist → Settings → Integrations → Developer → API token. Tasks go to your Inbox."
            value={form.todoistApiToken}
            onChange={update('todoistApiToken')}
            secret
            revealed={revealed}
          />
          <Field
            label="Due date when none is written"
            hint='Todoist wording, e.g. "today" or "tomorrow". Leave blank for no due date.'
            value={form.todoistDefaultDue}
            onChange={update('todoistDefaultDue')}
          />
        </>
      )}
      <Pressable onPress={() => setRevealed(!revealed)} hitSlop={12}>
        <Text style={styles.link}>{revealed ? 'Hide keys' : 'Show keys'}</Text>
      </Pressable>
      <Text style={styles.hint}>
        Keys for each service are kept when you switch, so you can switch back without
        re-entering them.
      </Text>

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
        <Text style={styles.link}>Import key file from MyStyle</Text>
      </Pressable>
      <Pressable onPress={() => setShowFormat(!showFormat)} hitSlop={12}>
        <Text style={styles.link}>{showFormat ? 'Hide key file format' : 'Key file format'}</Text>
      </Pressable>
      {showFormat && (
        <View style={styles.notice}>
          <Text style={styles.hint}>
            Instead of typing keys here, make a text file with this content, replace the
            PASTE_ values with your keys, and save it with a name ending in .json (for example
            ai-task-keys.json). Put it anywhere in MyStyle, e.g. with the Supernote Partner app.
            The plugin finds it automatically. To use OpenAI, set "aiProvider" to "openai" and
            fill in "openaiApiKey". To use Todoist, set "taskApp" to "todoist" and fill in
            "todoistApiToken".
          </Text>
          <Text style={styles.code}>{KEY_FILE_TEMPLATE}</Text>
          <Text style={styles.hint}>
            Keep the straight quotes ("). Phone keyboards may turn them into curly quotes; turn
            off Smart Punctuation or use a plain-text editor.
          </Text>
        </View>
      )}
      <Text style={styles.hint}>
        Keys are stored on this device in MyStyle/SnMarvin/settings.note. Each key is only sent
        to its own service.
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
  code: {fontSize: 22, lineHeight: 30, fontFamily: 'monospace', color: '#000000', marginVertical: 8},
  notice: {
    fontSize: 24,
    color: '#000000',
    borderWidth: 2,
    borderColor: '#000000',
    padding: 12,
    marginBottom: 16,
  },
  select: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selectText: {fontSize: 26, color: '#000000'},
  selectTextOn: {color: '#ffffff'},
  selectOption: {
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: '#000000',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectOptionOn: {backgroundColor: '#000000'},
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
