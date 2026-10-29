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
  onHelp: () => void;
};

const EMPTY: Config = normalize({});

/** Field label, with an optional small link on the right. */
function Label({text, right}: {text: string; right?: React.ReactNode}) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{text}</Text>
      {right}
    </View>
  );
}

/** Dropdown: shows the current choice; tap to list the options. */
function Select<T extends string>(props: {
  label: string;
  value: T;
  options: {value: T; label: string}[];
  onChange: (v: T) => void;
  style?: object;
}) {
  const [open, setOpen] = useState(false);
  const current = props.options.find(o => o.value === props.value);
  return (
    <View style={[styles.field, props.style]}>
      <Label text={props.label} />
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
  right?: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.field, props.style]}>
      <Label text={props.label} right={props.right} />
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChange}
        secureTextEntry={props.secret && !props.revealed}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
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

/** Large tap target with a box that shows ☑ / ☐. */
function Checkbox(props: {label: string; hint?: string; value: boolean; onChange: (v: boolean) => void}) {
  return (
    <Pressable style={styles.field} onPress={() => props.onChange(!props.value)} hitSlop={8}>
      <View style={styles.checkRow}>
        <Text style={styles.checkBox}>{props.value ? '☑' : '☐'}</Text>
        <Text style={styles.label}>{props.label}</Text>
      </View>
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </Pressable>
  );
}

function Link({text, onPress}: {text: string; onPress?: () => void}) {
  return (
    <Pressable onPress={onPress} hitSlop={12}>
      <Text style={styles.link}>{text}</Text>
    </Pressable>
  );
}

export default function SettingsScreen({resuming, fromGear, onSaved, onCancel, onHelp}: Props) {
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
          setNotice('Keys not saved yet: use the plugin once in a note before restarting.');
        } else if (isStoreUnreadable() && missingKeys(loaded).length) {
          setNotice('Open Settings from a note to see your saved keys.');
        } else if (isStoreUnreadable() && keyFilePath) {
          setNotice(`Using keys from ${keyFilePath}.`);
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
        return ['✗ No key file found in MyStyle. See "Key file format".'];
      }
      setForm(file);
      return [`Loaded ${keyFilePath ?? 'key file'}. Tap Save to keep the keys.`];
    });

  const save = () =>
    run(async () => {
      if (fromGear) {
        // Only claim "keys valid" (and hold them in memory) if both checks pass.
        const results = await checkBoth();
        if (results.some(r => !r.startsWith('✓'))) {
          return [...results, 'Not saved. Fix the key and tap Save again.'];
        }
      }
      onSaved(await saveSettings(form, fromGear));
    });

  const showKeys = (
    <Link text={revealed ? 'Hide' : 'Show'} onPress={() => setRevealed(!revealed)} />
  );

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}>
        <Text style={styles.title}>Settings</Text>
        <Link text="Instructions" onPress={onHelp} />
      </View>
      {resuming && <Text style={styles.notice}>Add your keys to finish sending. Your selection is kept.</Text>}
      {notice && <Text style={styles.notice}>{notice}</Text>}

      <View style={styles.pair}>
        <Select<AiProviderId>
          label="AI service"
          value={form.aiProvider}
          options={(Object.keys(AI_PROVIDERS) as AiProviderId[]).map(id => ({
            value: id,
            label: AI_PROVIDERS[id].label,
          }))}
          onChange={v => setForm(f => ({...f, aiProvider: v}))}
          style={styles.half}
        />
        {form.aiProvider === 'anthropic' ? (
          <Field
            label="Model"
            value={form.anthropicModel}
            onChange={update('anthropicModel')}
            style={styles.half}
          />
        ) : (
          <Field
            label="Model"
            value={form.openaiModel}
            onChange={update('openaiModel')}
            style={styles.half}
          />
        )}
      </View>
      {form.aiProvider === 'anthropic' ? (
        <Field
          label={AI_PROVIDERS.anthropic.keyLabel}
          hint={AI_PROVIDERS.anthropic.keyHint}
          value={form.anthropicApiKey}
          onChange={update('anthropicApiKey')}
          secret
          revealed={revealed}
          right={showKeys}
        />
      ) : (
        <Field
          label={AI_PROVIDERS.openai.keyLabel}
          hint={AI_PROVIDERS.openai.keyHint}
          value={form.openaiApiKey}
          onChange={update('openaiApiKey')}
          secret
          revealed={revealed}
          right={showKeys}
        />
      )}

      <View style={styles.pair}>
        <Select<TaskAppId>
          label="Task app"
          value={form.taskApp}
          options={(Object.keys(TASK_APPS) as TaskAppId[]).map(id => ({
            value: id,
            label: TASK_APPS[id].label,
          }))}
          onChange={v => setForm(f => ({...f, taskApp: v}))}
          style={styles.half}
        />
        {form.taskApp === 'marvin' ? (
          <Field
            label="Add to titles"
            value={form.titleSuffix}
            onChange={update('titleSuffix')}
            style={styles.half}
          />
        ) : (
          <Field
            label="Default due"
            value={form.todoistDefaultDue}
            onChange={update('todoistDefaultDue')}
            style={styles.half}
          />
        )}
      </View>
      {form.taskApp === 'marvin' ? (
        <Field
          label="Marvin API token"
          hint="Marvin → Features → API. Titles: Marvin shortcuts like +today, #Project, or blank."
          value={form.marvinApiToken}
          onChange={update('marvinApiToken')}
          secret
          revealed={revealed}
          right={showKeys}
        />
      ) : (
        <Field
          label="Todoist API token"
          hint='Todoist → Settings → Integrations → Developer. Due: e.g. "today", or blank for none.'
          value={form.todoistApiToken}
          onChange={update('todoistApiToken')}
          secret
          revealed={revealed}
          right={showKeys}
        />
      )}

      <Checkbox
        label="Create reminders from task times"
        hint="A time like 2pm sets the task time with a reminder 30 min before. Off: the time goes in the note."
        value={form.createReminders}
        onChange={v => setForm(f => ({...f, createReminders: v}))}
      />

      {messages.map((m, i) => (
        <Text key={i} style={styles.message}>
          {m}
        </Text>
      ))}

      <View style={styles.buttons}>
        <Button label="Test" onPress={test} disabled={busy} />
        <Button label={resuming ? 'Save & send' : 'Save'} onPress={save} disabled={busy} />
        <Button label="Cancel" onPress={onCancel} disabled={busy} />
      </View>
      <View style={styles.links}>
        <Link text="Import key file" onPress={busy ? undefined : importFile} />
        <Link
          text={showFormat ? 'Hide key file format' : 'Key file format'}
          onPress={() => setShowFormat(!showFormat)}
        />
      </View>
      {showFormat && (
        <View style={styles.box}>
          <Text style={styles.hint}>
            Or skip typing: save this as any .json file anywhere in MyStyle (e.g. with the
            Supernote Partner app), with your keys in place of PASTE_…. For OpenAI or Todoist, set
            "aiProvider"/"taskApp" and fill in that key. Keep straight quotes (").
          </Text>
          <Text style={styles.code}>{KEY_FILE_TEMPLATE}</Text>
        </View>
      )}
      <Text style={styles.hint}>
        Keys stay on this device; each is only sent to its own service. Switching services keeps
        the other keys.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  title: {fontSize: 32, fontWeight: '700', color: '#000000'},
  notice: {fontSize: 20, color: '#000000', fontStyle: 'italic', marginBottom: 8},
  pair: {flexDirection: 'row', gap: 16},
  half: {flex: 1},
  field: {marginBottom: 12},
  labelRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline'},
  label: {fontSize: 23, fontWeight: '600', color: '#000000', marginBottom: 4},
  hint: {fontSize: 19, color: '#000000', marginTop: 4},
  input: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    fontSize: 23,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: '#000000',
  },
  select: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selectText: {fontSize: 23, color: '#000000'},
  selectTextOn: {color: '#ffffff'},
  selectOption: {
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectOptionOn: {backgroundColor: '#000000'},
  checkRow: {flexDirection: 'row', alignItems: 'center'},
  checkBox: {fontSize: 32, color: '#000000', marginRight: 10, lineHeight: 36},
  link: {fontSize: 21, color: '#000000', textDecorationLine: 'underline'},
  links: {flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8},
  message: {fontSize: 22, color: '#000000', marginBottom: 4},
  code: {fontSize: 19, lineHeight: 26, fontFamily: 'monospace', color: '#000000', marginTop: 6},
  box: {borderWidth: 2, borderColor: '#000000', padding: 10, marginBottom: 8},
  buttons: {flexDirection: 'row', justifyContent: 'center', marginTop: 4},
  button: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginHorizontal: 8,
  },
  buttonDisabled: {borderColor: '#9d9d9d'},
  buttonText: {fontSize: 26, fontWeight: '600', color: '#000000'},
});
