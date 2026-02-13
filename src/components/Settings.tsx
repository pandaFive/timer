import { useState, useEffect, useCallback } from 'react';
import type { TimerConfig, TimerPreset } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { extractVideoId } from '../utils/youtube';

const LEGACY_STORAGE_KEY = 'hiit-timer-config';
const DRAFT_STORAGE_KEY = 'hiit-timer-draft';
const PRESETS_STORAGE_KEY = 'hiit-timer-presets';
const MAX_PRESETS = 3;
const SAVE_STATUS_DURATION_MS = 2000;
const PRESET_NAME_MAX_LENGTH = 30;

const DRAFT_SAVE_ERROR_MESSAGE =
  '下書き設定の保存に失敗しました。ブラウザ容量を確認してください';
const PRESET_SAVE_ERROR_MESSAGE =
  '保存済み設定の保存に失敗しました。ブラウザ容量を確認してください';
const PRESET_LOAD_WARNING_MESSAGE = '保存済み設定の一部を読み込めませんでした';
const PRESET_LOAD_ERROR_MESSAGE = '保存済み設定の読み込みに失敗しました';
const LEGACY_MIGRATION_ERROR_MESSAGE = '旧設定の移行に失敗しました';

interface PresetStore {
  presets: TimerPreset[];
}

interface PresetLoadResult {
  presets: TimerPreset[];
  warning: string;
}

interface StorageWriteResult {
  ok: boolean;
  message: string;
}

interface MigrationResult {
  ok: boolean;
  migrated: boolean;
  message: string;
}

interface InitialState {
  config: TimerConfig;
  presets: TimerPreset[];
  warning: string;
}

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

/** 設定を値コピーで複製 */
function cloneConfig(config: TimerConfig): TimerConfig {
  return {
    workoutSeconds: config.workoutSeconds,
    restSeconds: config.restSeconds,
    sets: config.sets,
    rounds: config.rounds,
    betweenSetsRestSeconds: config.betweenSetsRestSeconds,
    workoutUrl: config.workoutUrl,
    restUrl: config.restUrl,
  };
}

/** 制御文字を除去したプリセット名を返す */
function sanitizePresetName(value: string): string {
  return value.replace(/\p{C}+/gu, '').trim();
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

/** 想定するストレージアクセスエラー */
function isStorageAccessError(error: unknown): error is DOMException {
  return (
    error instanceof DOMException &&
    (error.name === 'SecurityError' || error.name === 'QuotaExceededError')
  );
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

/** URL項目のみ安全側へ正規化 */
function sanitizeUrls(config: TimerConfig): TimerConfig {
  return {
    ...config,
    workoutUrl:
      config.workoutUrl && extractVideoId(config.workoutUrl)
        ? config.workoutUrl
        : '',
    restUrl:
      config.restUrl && extractVideoId(config.restUrl) ? config.restUrl : '',
  };
}

/** 旧単一設定の有効値のみを厳格に復元 */
function loadLegacyConfig(): TimerConfig | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;

    const config = sanitizeUrls(
      normalizeConfig(JSON.parse(raw), DEFAULT_CONFIG),
    );
    const errors = validate(config);
    return Object.keys(errors).length === 0 ? config : null;
  } catch (error: unknown) {
    if (error instanceof SyntaxError || isStorageAccessError(error)) {
      console.warn('旧設定の読み込みに失敗しました:', error);
      return null;
    }
    throw error;
  }
}

/** 下書き設定をlocalStorageから復元 */
function loadDraftConfig(): TimerConfig {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return loadLegacyConfig() ?? DEFAULT_CONFIG;

    return normalizeConfig(JSON.parse(raw), DEFAULT_CONFIG);
  } catch (error: unknown) {
    if (error instanceof SyntaxError || isStorageAccessError(error)) {
      console.warn('下書き設定の読み込みに失敗しました:', error);
      return loadLegacyConfig() ?? DEFAULT_CONFIG;
    }
    throw error;
  }
}

/** 下書き設定キーが有効なJSONかどうかを判定 */
function hasValidDraftConfig(): boolean {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return false;

    const config = sanitizeUrls(
      normalizeConfig(JSON.parse(raw), DEFAULT_CONFIG),
    );
    return Object.keys(validate(config)).length === 0;
  } catch (error: unknown) {
    if (error instanceof SyntaxError || isStorageAccessError(error)) {
      console.warn('下書き設定キーが不正なため再生成します:', error);
      return false;
    }
    throw error;
  }
}

/** プリセット配列をlocalStorageから復元 */
function loadPresets(): PresetLoadResult {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return { presets: [], warning: '' };

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      console.warn('プリセット形式が不正なため空配列で初期化します');
      return { presets: [], warning: PRESET_LOAD_WARNING_MESSAGE };
    }

    const store = parsed as { presets?: unknown };
    if (!Array.isArray(store.presets)) {
      console.warn('プリセット配列が不正なため空配列で初期化します');
      return { presets: [], warning: PRESET_LOAD_WARNING_MESSAGE };
    }

    const nameSet = new Set<string>();
    const result: TimerPreset[] = [];
    let droppedCount = 0;

    for (const preset of store.presets) {
      if (result.length >= MAX_PRESETS) {
        droppedCount += 1;
        continue;
      }
      if (!preset || typeof preset !== 'object') {
        droppedCount += 1;
        continue;
      }

      const obj = preset as Record<string, unknown>;
      if (typeof obj.id !== 'string' || typeof obj.createdAt !== 'number') {
        droppedCount += 1;
        continue;
      }

      const name = sanitizePresetName(
        typeof obj.name === 'string' ? obj.name : '',
      );
      if (name.length < 1 || name.length > PRESET_NAME_MAX_LENGTH) {
        droppedCount += 1;
        continue;
      }

      const normalizedName = name.toLowerCase();
      if (nameSet.has(normalizedName)) {
        droppedCount += 1;
        continue;
      }

      const config = sanitizeUrls(normalizeConfig(obj.config, DEFAULT_CONFIG));
      if (Object.keys(validate(config)).length > 0) {
        droppedCount += 1;
        continue;
      }

      nameSet.add(normalizedName);
      result.push({
        id: obj.id,
        name,
        config: cloneConfig(config),
        createdAt: obj.createdAt,
      });
    }

    if (droppedCount > 0) {
      console.warn(
        `不正なプリセットを ${droppedCount} 件スキップしました（保持: ${result.length} 件）`,
      );
      return { presets: result, warning: PRESET_LOAD_WARNING_MESSAGE };
    }

    return { presets: result, warning: '' };
  } catch (error: unknown) {
    if (error instanceof SyntaxError || isStorageAccessError(error)) {
      console.warn('プリセットの読み込みに失敗しました:', error);
      return { presets: [], warning: PRESET_LOAD_ERROR_MESSAGE };
    }
    throw error;
  }
}

/** 下書き設定をlocalStorageに保存 */
function saveDraftConfig(config: TimerConfig): StorageWriteResult {
  try {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify(cloneConfig(config)),
    );
    return { ok: true, message: '' };
  } catch (error: unknown) {
    if (isStorageAccessError(error)) {
      console.warn('下書き設定の保存に失敗しました:', error);
      return { ok: false, message: DRAFT_SAVE_ERROR_MESSAGE };
    }
    throw error;
  }
}

/** プリセット配列をlocalStorageに保存 */
function savePresets(presets: TimerPreset[]): StorageWriteResult {
  try {
    const store: PresetStore = { presets };
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(store));
    return { ok: true, message: '' };
  } catch (error: unknown) {
    if (isStorageAccessError(error)) {
      console.warn('プリセットの保存に失敗しました:', error);
      return { ok: false, message: PRESET_SAVE_ERROR_MESSAGE };
    }
    throw error;
  }
}

/** 旧単一設定キーを削除 */
function removeLegacyConfig(): StorageWriteResult {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return { ok: true, message: '' };
  } catch (error: unknown) {
    if (isStorageAccessError(error)) {
      console.warn('旧設定キーの削除に失敗しました:', error);
      return { ok: false, message: LEGACY_MIGRATION_ERROR_MESSAGE };
    }
    throw error;
  }
}

/** プリセットIDを生成 */
function createPresetId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `preset-${globalThis.crypto.randomUUID()}`;
  }

  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 旧単一設定をプリセット形式へ互換移行 */
function migrateLegacyConfig(): MigrationResult {
  try {
    if (localStorage.getItem(PRESETS_STORAGE_KEY)) {
      return { ok: true, migrated: false, message: '' };
    }

    const legacyConfig = loadLegacyConfig();
    const now = Date.now();
    const migratedPresets: TimerPreset[] = legacyConfig
      ? [
          {
            id: `legacy-${now}`,
            name: '既存設定',
            config: cloneConfig(legacyConfig),
            createdAt: now,
          },
        ]
      : [];

    const presetSaveResult = savePresets(migratedPresets);
    if (!presetSaveResult.ok) {
      return { ok: false, migrated: false, message: presetSaveResult.message };
    }

    let writeWarning = '';
    if (legacyConfig && !hasValidDraftConfig()) {
      const draftSaveResult = saveDraftConfig(legacyConfig);
      if (!draftSaveResult.ok) {
        writeWarning = draftSaveResult.message;
      }
    }

    const removeLegacyResult = removeLegacyConfig();
    if (!removeLegacyResult.ok) {
      return {
        ok: false,
        migrated: true,
        message: removeLegacyResult.message,
      };
    }

    if (writeWarning) {
      return { ok: false, migrated: true, message: writeWarning };
    }

    return { ok: true, migrated: true, message: '' };
  } catch (error: unknown) {
    if (isStorageAccessError(error)) {
      console.warn('旧設定の移行に失敗しました:', error);
      return {
        ok: false,
        migrated: false,
        message: LEGACY_MIGRATION_ERROR_MESSAGE,
      };
    }
    throw error;
  }
}

/** 初期状態を復元 */
function loadInitialState(): InitialState {
  const presetsResult = loadPresets();
  return {
    config: loadDraftConfig(),
    presets: presetsResult.presets,
    warning: presetsResult.warning,
  };
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
  rawName: string,
  presets: TimerPreset[],
): { name: string; error: string | null } {
  const name = sanitizePresetName(rawName);

  if (name.length < 1) {
    return { name, error: 'プリセット名を入力してください' };
  }
  if (name.length > PRESET_NAME_MAX_LENGTH) {
    return {
      name,
      error: `プリセット名は${PRESET_NAME_MAX_LENGTH}文字以内で入力してください`,
    };
  }

  const normalizedName = name.toLowerCase();
  const duplicated = presets.some(
    (preset) =>
      sanitizePresetName(preset.name).toLowerCase() === normalizedName,
  );
  if (duplicated) {
    return { name, error: '同名のプリセットが既に存在します' };
  }

  return { name, error: null };
}

interface SettingsProps {
  disabled: boolean;
  onStart: (config: TimerConfig) => void;
}

export function Settings({ disabled, onStart }: SettingsProps) {
  const [initialState] = useState<InitialState>(loadInitialState);
  const [config, setConfig] = useState<TimerConfig>(() =>
    cloneConfig(initialState.config),
  );
  const [presets, setPresets] = useState<TimerPreset[]>(initialState.presets);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetError, setPresetError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [storageWarning, setStorageWarning] = useState(initialState.warning);
  const [storageError, setStorageError] = useState('');

  // 初回マウント時に旧設定移行を実行
  useEffect(() => {
    const migration = migrateLegacyConfig();
    if (!migration.migrated) {
      if (!migration.ok) setStorageError(migration.message);
      return;
    }

    const reloadedPresets = loadPresets();
    setPresets(reloadedPresets.presets);
    setStorageWarning(reloadedPresets.warning);
    setConfig(loadDraftConfig());

    if (!migration.ok) {
      setStorageError(migration.message);
    }
  }, []);

  // 下書き設定の自動保存
  useEffect(() => {
    const saveResult = saveDraftConfig(config);
    if (!saveResult.ok) {
      setStorageError(saveResult.message);
      return;
    }

    setStorageError((prev) => (prev === DRAFT_SAVE_ERROR_MESSAGE ? '' : prev));
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

    const { name: sanitizedName, error: nameError } = validatePresetName(
      presetName,
      presets,
    );
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
      id: createPresetId(),
      name: sanitizedName,
      config: cloneConfig(config),
      createdAt: now,
    };
    const nextPresets = [...presets, newPreset];

    const saveResult = savePresets(nextPresets);
    if (!saveResult.ok) {
      setStorageError(saveResult.message);
      setStatusMessage('');
      return;
    }

    setPresets(nextPresets);
    setStorageError('');
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

    setConfig(cloneConfig(preset.config));
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

    const saveResult = savePresets(nextPresets);
    if (!saveResult.ok) {
      setStorageError(saveResult.message);
      setStatusMessage('');
      return;
    }

    setPresets(nextPresets);
    setStorageError('');
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
            maxLength={PRESET_NAME_MAX_LENGTH}
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

      {(presetError || storageError || storageWarning || statusMessage) && (
        <div className="settings__field">
          {presetError && (
            <span className="settings__error" role="alert">
              {presetError}
            </span>
          )}
          {storageError && (
            <span className="settings__error" role="alert">
              {storageError}
            </span>
          )}
          {storageWarning && (
            <span className="settings__warning" role="alert">
              {storageWarning}
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
