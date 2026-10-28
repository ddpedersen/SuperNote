/**
 * The AI providers and task apps the user can pick in Settings. To add one,
 * implement its module and register it here (and in config.ts's types).
 */
import * as claude from './claude';
import * as openai from './openai';
import * as marvin from './marvin';
import * as todoist from './todoist';
import type { AiProviderId, Config, TaskAppId } from './config';
import type { Content, ExtractedTask, Mode } from './prompt';

export type AiProvider = {
  label: string;
  keyLabel: string;
  keyHint: string;
  apiKey: (c: Config) => string;
  model: (c: Config) => string;
  extractTasks: (apiKey: string, model: string, input: Content, mode: Mode) => Promise<ExtractedTask[]>;
  checkKey: (apiKey: string, model: string) => Promise<string>;
};

export type TaskApp = {
  label: string;
  addTask: (c: Config, task: ExtractedTask) => Promise<void>;
  checkToken: (c: Config) => Promise<string>;
};

export const AI_PROVIDERS: Record<AiProviderId, AiProvider> = {
  anthropic: {
    label: 'Claude',
    keyLabel: 'Anthropic API key',
    keyHint: 'console.anthropic.com → API keys (starts with sk-ant-)',
    apiKey: c => c.anthropicApiKey,
    model: c => c.anthropicModel,
    extractTasks: claude.extractTasks,
    checkKey: claude.checkKey,
  },
  openai: {
    label: 'OpenAI',
    keyLabel: 'OpenAI API key',
    keyHint: 'platform.openai.com → API keys (starts with sk-)',
    apiKey: c => c.openaiApiKey,
    model: c => c.openaiModel,
    extractTasks: openai.extractTasks,
    checkKey: openai.checkKey,
  },
};

export const TASK_APPS: Record<TaskAppId, TaskApp> = {
  marvin: {
    label: 'Amazing Marvin',
    addTask: (c, task) => marvin.addTask(c.marvinApiToken, task, c.titleSuffix),
    checkToken: c => marvin.checkToken(c.marvinApiToken),
  },
  todoist: {
    label: 'Todoist',
    addTask: (c, task) => todoist.addTask(c.todoistApiToken, task, c.todoistDefaultDue),
    checkToken: c => todoist.checkToken(c.todoistApiToken),
  },
};

export const aiFor = (c: Config) => AI_PROVIDERS[c.aiProvider];
export const taskAppFor = (c: Config) => TASK_APPS[c.taskApp];
