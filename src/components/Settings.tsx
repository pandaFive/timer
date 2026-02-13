import { useState, useEffect, useCallback } from 'react';
import type { PresetStore, TimerConfig, TimerPreset } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { extractVideoId } from '../utils/youtube';

const LEGACY_STORAGE_KEY = 'hiit-timer-config';
const DRAFT_STORAGE_KEY = 'hiit-timer-draft';
const PRESETS_STORAGE_KEY = 'hiit-timer-presets';
const MAX_PRESETS = 3;
const SAVE_STATUS_DURATION_MS = 2000;

/** バリデーションエラー */
interface ValidationErrors {
  workoutSeconds?: string;
  restSeconds?: string;
  sets?: string;
  rounds?: string;
  betweenSetsRestSeconds?: string;
  workoutUrl?: string;
  restUrl?: string;
}

/** 数値フィールドの安全な復元（NaN/Infinity/範囲外はフォールバック） */
function safeInt(
  val: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof val === 'number' &&
    Number.isFinite(val) &&
    val >= min &&
    val <= max
    ? Math.round(val)
    : fallback;
}

/** 不正値をフォールバックしながら設定を復元 */
function normalizeConfig(
  value: unknown,
  fallback: TimerConfig = DEFAULT_CONFIG,
): TimerConfig {
  if (!value || typeof value !== 'object') return fallback;

  const obj = value as Record<string, unknown>;
  return {
    workoutSeconds: safeInt(
      obj.workoutSeconds,
      1,
      600,
      fallback.workoutSeconds,
    ),
    restSeconds: safeInt(obj.restSeconds, 1, 600, fallback.restSeconds),
    sets: safeInt(obj.sets, 1, 99, fallback.sets),
    rounds: safeInt(obj.rounds, 1, 99, fallback.rounds),
    betweenSetsRestSeconds: safeInt(
      obj.betweenSetsRestSeconds,
      0,
      600,
      fallback.betweenSetsRestSeconds,
    ),
    workoutUrl:
      typeof obj.workoutUrl === 'string' ? obj.workoutUrl : fallback.workoutUrl,
    restUrl: typeof obj.restUrl === 'string' ? obj.restUrl : fallback.restUrl,
  };
}

/** 旧単一設定の有効値のみを厳格に復元 */
function loadLegacyConfig(): TimerConfig | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;

    const config = normalizeConfig(JSON.parse(raw), DEFAULT_CONFIG);
    const errors = validate(config);
    return Object.keys(errors).length === 0 ? config : null;
  } catch (e) {
    console.warn('旧設定の読み込みに失敗しました:', e);
    return null;
  }
}

/** 下書き設定をlocalStorageから復元 */
function loadDraftConfig(): TimerConfig {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return loadLegacyConfig() ?? DEFAULT_CONFIG;

    return normalizeConfig(JSON.parse(raw), DEFAULT_CONFIG);
  } catch (e) {
    console.warn('下書き設定の読み込みに失敗しました:', e);
    return loadLegacyConfig() ?? DEFAULT_CONFIG;
  }
}

/** プリセット配列をlocalStorageから復元 */
function loadPresets(): TimerPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];

    const store = parsed as { presets?: unknown };
    if (!Array.isArray(store.presets)) return [];

    const nameSet = new Set<string>();
    const result: TimerPreset[] = [];

    for (const preset of store.presets) {
      if (result.length >= MAX_PRESETS) break;
      if (!preset || typeof preset !== 'object') continue;

      const obj = preset as Record<string, unknown>;
      if (
        typeof obj.id !== 'string' ||
        typeof obj.name !== 'string' ||
        typeof obj.createdAt !== 'number' ||
        typeof obj.updatedAt !== 'number'
      ) {
        continue;
      }

      const name = obj.name.trim();
      if (name.length < 1 || name.length > 30) continue;
      const normalizedName = name.toLowerCase();
      if (nameSet.has(normalizedName)) continue;

      const config = normalizeConfig(obj.config, DEFAULT_CONFIG);
      if (Object.keys(validate(config)).length > 0) continue;

      nameSet.add(normalizedName);
      result.push({
        id: obj.id,
        name,
        config,
        createdAt: obj.createdAt,
        updatedAt: obj.updatedAt,
      });
    }

    return result;
  } catch (e) {
    console.warn('プリセットの読み込みに失敗しました:', e);
    return [];
  }
}

/** 下書き設定をlocalStorageに保存 */
function saveDraftConfig(config: TimerConfig): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('下書き設定の保存に失敗しました:', e);
  }
}

/** プリセット配列をlocalStorageに保存 */
function savePresets(presets: TimerPreset[]): void {
  try {
    const store: PresetStore = { presets };
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('プリセットの保存に失敗しました:', e);
  }
}

/** 旧単一設定をプリセット形式へ互換移行 */
function migrateLegacyConfig(): void {
  try {
    if (localStorage.getItem(PRESETS_STORAGE_KEY)) return;

    const legacyConfig = loadLegacyConfig();
    if (!legacyConfig) {
      savePresets([]);
      return;
    }

    const now = Date.now();
    const preset: TimerPreset = {
      id: `legacy-${now}`,
      name: '既存設定',
      config: legacyConfig,
      createdAt: now,
      updatedAt: now,
    };

    savePresets([preset]);
    if (!localStorage.getItem(DRAFT_STORAGE_KEY)) {
      saveDraftConfig(legacyConfig);
    }
  } catch (e) {
    console.warn('旧設定の移行に失敗しました:', e);
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
  if (config.sets < 1 || config.sets > 99 || !Number.isInteger(config.sets)) {
    errors.sets = '1〜99の整数を入力してください';
  }
  if (
    config.rounds < 1 ||
    config.rounds > 99 ||
    !Number.isInteger(config.rounds)
  ) {
    errors.rounds = '1〜99の整数を入力してください';
  }
  if (
    config.betweenSetsRestSeconds < 0 ||
    config.betweenSetsRestSeconds > 600 ||
    !Number.isInteger(config.betweenSetsRestSeconds)
  ) {
    errors.betweenSetsRestSeconds = '0〜600の整数を入力してください';
  }
  if (config.workoutUrl && !extractVideoId(config.workoutUrl)) {
    errors.workoutUrl = '有効なYouTube URLを入力してください';
  }
  if (config.restUrl && !extractVideoId(config.restUrl)) {
    errors.restUrl = '有効なYouTube URLを入力してください';
  }

  return errors;
}

/** プリセット名のバリデーション */
function validatePresetName(
  name: string,
  presets: TimerPreset[],
): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1) return 'プリセット名を入力してください';
  if (trimmed.length > 30) return 'プリセット名は30文字以内で入力してください';

  const normalizedName = trimmed.toLowerCase();
  const duplicated = presets.some(
    (preset) => preset.name.toLowerCase() === normalizedName,
  );
  if (duplicated) return '同名のプリセットが既に存在します';

  return null;
}

interface SettingsProps {
  disabled: boolean;
  onStart: (config: TimerConfig) => void;
}

export function Settings({ disabled, onStart }: SettingsProps) {
  const [config, setConfig] = useState<TimerConfig>(() => {
    migrateLegacyConfig();
    return loadDraftConfig();
  });
  const [presets, setPresets] = useState<TimerPreset[]>(() => {
    migrateLegacyConfig();
    return loadPresets();
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetError, setPresetError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // 下書き設定の自動保存
  useEffect(() => {
    saveDraftConfig(config);
  }, [config]);

  // ステータスメッセージを一定時間で消す
  useEffect(() => {
    if (!statusMessage) return;
    const timeoutId = window.setTimeout(
      () => setStatusMessage(''),
      SAVE_STATUS_DURATION_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [statusMessage]);

  const handleChange = useCallback(
    (field: keyof TimerConfig, value: string) => {
      setStatusMessage('');
      setPresetError('');
      setConfig((prev) => {
        const numFields = [
          'workoutSeconds',
          'restSeconds',
          'sets',
          'rounds',
          'betweenSetsRestSeconds',
        ] as const;
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

  const handleSavePreset = useCallback(() => {
    const validationErrors = validate(config);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setPresetError('入力エラーを修正してから保存してください');
      setStatusMessage('');
      return;
    }

    const nameError = validatePresetName(presetName, presets);
    if (nameError) {
      setPresetError(nameError);
      setStatusMessage('');
      return;
    }

    if (presets.length >= MAX_PRESETS) {
      setPresetError(
        'プリセットは3件までです。保存済み設定を削除してから保存してください',
      );
      setStatusMessage('');
      return;
    }

    const now = Date.now();
    const newPreset: TimerPreset = {
      id: `preset-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: presetName.trim(),
      config,
      createdAt: now,
      updatedAt: now,
    };
    const nextPresets = [...presets, newPreset];

    setPresets(nextPresets);
    savePresets(nextPresets);
    setSelectedPresetId(newPreset.id);
    setPresetName('');
    setPresetError('');
    setStatusMessage('プリセットを保存しました');
  }, [config, presetName, presets]);

  const handleLoadPreset = useCallback(() => {
    if (!selectedPresetId) {
      setPresetError('読み込むプリセットを選択してください');
      setStatusMessage('');
      return;
    }

    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) {
      setPresetError('選択したプリセットが見つかりません');
      setStatusMessage('');
      return;
    }

    setConfig(preset.config);
    setErrors({});
    setPresetError('');
    setStatusMessage('プリセットを読み込みました');
  }, [presets, selectedPresetId]);

  const handleDeletePreset = useCallback(() => {
    if (!selectedPresetId) {
      setPresetError('削除するプリセットを選択してください');
      setStatusMessage('');
      return;
    }

    const nextPresets = presets.filter(
      (preset) => preset.id !== selectedPresetId,
    );
    if (nextPresets.length === presets.length) {
      setPresetError('選択したプリセットが見つかりません');
      setStatusMessage('');
      return;
    }

    setPresets(nextPresets);
    savePresets(nextPresets);
    setSelectedPresetId('');
    setPresetError('');
    setStatusMessage('プリセットを削除しました');
  }, [presets, selectedPresetId]);

  return (
    <form className="settings" onSubmit={handleSubmit}>
      <h2>設定</h2>

      <div className="settings__field-group">
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
          <label htmlFor="sets">セット数</label>
          <input
            id="sets"
            type="number"
            min={1}
            max={99}
            value={config.sets}
            onChange={(e) => handleChange('sets', e.target.value)}
            disabled={disabled}
          />
          {errors.sets && (
            <span className="settings__error" role="alert">
              {errors.sets}
            </span>
          )}
        </div>

        <div className="settings__field">
          <label htmlFor="betweenSetsRestSeconds">セット間休憩（秒）</label>
          <input
            id="betweenSetsRestSeconds"
            type="number"
            min={0}
            max={600}
            value={config.betweenSetsRestSeconds}
            onChange={(e) =>
              handleChange('betweenSetsRestSeconds', e.target.value)
            }
            disabled={disabled}
          />
          {errors.betweenSetsRestSeconds && (
            <span className="settings__error" role="alert">
              {errors.betweenSetsRestSeconds}
            </span>
          )}
        </div>
      </div>

      <div className="settings__field-group">
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
      </div>

      <div className="settings__field-group">
        <div className="settings__field">
          <label htmlFor="presetName">プリセット名</label>
          <input
            id="presetName"
            type="text"
            maxLength={30}
            value={presetName}
            onChange={(e) => {
              setPresetName(e.target.value);
              setPresetError('');
              setStatusMessage('');
            }}
            disabled={disabled}
            placeholder="例: 朝トレメニュー"
          />
        </div>

        <div className="settings__field">
          <label htmlFor="savedPreset">保存済み設定</label>
          <select
            id="savedPreset"
            value={selectedPresetId}
            onChange={(e) => {
              setSelectedPresetId(e.target.value);
              setPresetError('');
              setStatusMessage('');
            }}
            disabled={disabled || presets.length === 0}
            className="settings__select"
          >
            <option value="">選択してください</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        <div className="settings__actions settings__actions--compact">
          <button
            type="button"
            onClick={handleLoadPreset}
            disabled={disabled || !selectedPresetId}
            className="settings__secondary-btn"
          >
            読込
          </button>
          <button
            type="button"
            onClick={handleDeletePreset}
            disabled={disabled || !selectedPresetId}
            className="settings__danger-btn"
          >
            削除
          </button>
        </div>
      </div>

      {(presetError || statusMessage) && (
        <div className="settings__field">
          {presetError && (
            <span className="settings__error" role="alert">
              {presetError}
            </span>
          )}
          {statusMessage && (
            <span className="settings__status" role="status">
              {statusMessage}
            </span>
          )}
        </div>
      )}

      <div className="settings__actions">
        <button
          type="button"
          disabled={disabled}
          className="settings__save-btn"
          onClick={handleSavePreset}
        >
          保存
        </button>
        <button
          type="submit"
          disabled={disabled}
          className="settings__start-btn"
        >
          スタート
        </button>
      </div>
    </form>
  );
}
