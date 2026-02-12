import { useState, useEffect, useCallback } from 'react';
import type { TimerConfig } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { extractVideoId } from '../utils/youtube';

const STORAGE_KEY = 'hiit-timer-config';

/** バリデーションエラー */
interface ValidationErrors {
  workoutSeconds?: string;
  restSeconds?: string;
  rounds?: string;
  workoutUrl?: string;
  restUrl?: string;
}

/** localStorageから設定を復元（破損データはデフォルト値にフォールバック） */
function loadConfig(): TimerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_CONFIG;

    const obj = parsed as Record<string, unknown>;
    const config: TimerConfig = {
      workoutSeconds:
        typeof obj.workoutSeconds === 'number'
          ? obj.workoutSeconds
          : DEFAULT_CONFIG.workoutSeconds,
      restSeconds:
        typeof obj.restSeconds === 'number'
          ? obj.restSeconds
          : DEFAULT_CONFIG.restSeconds,
      rounds:
        typeof obj.rounds === 'number' ? obj.rounds : DEFAULT_CONFIG.rounds,
      workoutUrl:
        typeof obj.workoutUrl === 'string'
          ? obj.workoutUrl
          : DEFAULT_CONFIG.workoutUrl,
      restUrl:
        typeof obj.restUrl === 'string' ? obj.restUrl : DEFAULT_CONFIG.restUrl,
    };

    return config;
  } catch (e) {
    console.warn('localStorage設定の読み込みに失敗しました:', e);
    return DEFAULT_CONFIG;
  }
}

/** 設定をlocalStorageに保存 */
function saveConfig(config: TimerConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('localStorage設定の保存に失敗しました:', e);
  }
}

/** 入力値のバリデーション */
function validate(config: TimerConfig): ValidationErrors {
  const errors: ValidationErrors = {};

  if (
    config.workoutSeconds < 1 ||
    config.workoutSeconds > 600 ||
    !Number.isInteger(config.workoutSeconds)
  ) {
    errors.workoutSeconds = '1〜600の整数を入力してください';
  }
  if (
    config.restSeconds < 1 ||
    config.restSeconds > 600 ||
    !Number.isInteger(config.restSeconds)
  ) {
    errors.restSeconds = '1〜600の整数を入力してください';
  }
  if (
    config.rounds < 1 ||
    config.rounds > 99 ||
    !Number.isInteger(config.rounds)
  ) {
    errors.rounds = '1〜99の整数を入力してください';
  }
  if (config.workoutUrl && !extractVideoId(config.workoutUrl)) {
    errors.workoutUrl = '有効なYouTube URLを入力してください';
  }
  if (config.restUrl && !extractVideoId(config.restUrl)) {
    errors.restUrl = '有効なYouTube URLを入力してください';
  }

  return errors;
}

interface SettingsProps {
  disabled: boolean;
  onStart: (config: TimerConfig) => void;
}

export function Settings({ disabled, onStart }: SettingsProps) {
  const [config, setConfig] = useState<TimerConfig>(loadConfig);
  const [errors, setErrors] = useState<ValidationErrors>({});

  // 設定変更時に自動保存
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const handleChange = useCallback(
    (field: keyof TimerConfig, value: string) => {
      setConfig((prev) => {
        const numFields = ['workoutSeconds', 'restSeconds', 'rounds'] as const;
        if ((numFields as readonly string[]).includes(field)) {
          return { ...prev, [field]: parseInt(value, 10) || 0 };
        }
        return { ...prev, [field]: value };
      });
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const validationErrors = validate(config);
      setErrors(validationErrors);

      if (Object.keys(validationErrors).length === 0) {
        onStart(config);
      }
    },
    [config, onStart],
  );

  return (
    <form className="settings" onSubmit={handleSubmit}>
      <h2>設定</h2>

      <div className="settings__field">
        <label htmlFor="workoutSeconds">ワークアウト（秒）</label>
        <input
          id="workoutSeconds"
          type="number"
          min={1}
          max={600}
          value={config.workoutSeconds}
          onChange={(e) => handleChange('workoutSeconds', e.target.value)}
          disabled={disabled}
        />
        {errors.workoutSeconds && (
          <span className="settings__error" role="alert">
            {errors.workoutSeconds}
          </span>
        )}
      </div>

      <div className="settings__field">
        <label htmlFor="restSeconds">休憩（秒）</label>
        <input
          id="restSeconds"
          type="number"
          min={1}
          max={600}
          value={config.restSeconds}
          onChange={(e) => handleChange('restSeconds', e.target.value)}
          disabled={disabled}
        />
        {errors.restSeconds && (
          <span className="settings__error" role="alert">
            {errors.restSeconds}
          </span>
        )}
      </div>

      <div className="settings__field">
        <label htmlFor="rounds">ラウンド数</label>
        <input
          id="rounds"
          type="number"
          min={1}
          max={99}
          value={config.rounds}
          onChange={(e) => handleChange('rounds', e.target.value)}
          disabled={disabled}
        />
        {errors.rounds && (
          <span className="settings__error" role="alert">
            {errors.rounds}
          </span>
        )}
      </div>

      <div className="settings__field">
        <label htmlFor="workoutUrl">ワークアウト曲（YouTube URL）</label>
        <input
          id="workoutUrl"
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={config.workoutUrl}
          onChange={(e) => handleChange('workoutUrl', e.target.value)}
          disabled={disabled}
        />
        {errors.workoutUrl && (
          <span className="settings__error" role="alert">
            {errors.workoutUrl}
          </span>
        )}
      </div>

      <div className="settings__field">
        <label htmlFor="restUrl">休憩曲（YouTube URL）</label>
        <input
          id="restUrl"
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={config.restUrl}
          onChange={(e) => handleChange('restUrl', e.target.value)}
          disabled={disabled}
        />
        {errors.restUrl && (
          <span className="settings__error" role="alert">
            {errors.restUrl}
          </span>
        )}
      </div>

      <button type="submit" disabled={disabled} className="settings__start-btn">
        スタート
      </button>
    </form>
  );
}
