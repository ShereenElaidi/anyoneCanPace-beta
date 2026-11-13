/**
 * Adding a personal route (design/backend-v1-spec.md §4): choose a GPX, trim
 * the start and end if they're near home, build it on this device, check the
 * turns (the route editor's turn screen), name it, save. The draft is kept on
 * the device at every step, so leaving and coming back loses nothing.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, postApi, saveMyRoute } from '../account/api';
import { NAME_MAX, PLACE_MAX, validateTurns } from '../dev/routeEditor/edits';
import { normalizeTurns } from '../dev/routeEditor/turnEdit';
import { TurnEditor } from '../dev/routeEditor/TurnEditor';
import type { Turn } from '../nav/types';
import { DESCRIPTION_MAX, ROUTE_TAGS, validateDescription } from '../sixk/describe';
import { buildDraft, TRIM_CHOICES, uploadBody, type BuildStep, type Draft } from './build';
import { draftStore } from './drafts';
import { insideMapArea, ROUTE_MAPS } from '../sixk/map/routeTiles';
import '../dev/routeEditor/editor.css';
import '../account/account.css';

interface Props {
  /** An unsaved route to carry on with. */
  draft?: Draft | null;
  onDone: () => void;
}

type Stage = 'pick' | 'building' | 'turns' | 'details' | 'saved';

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Try again.');
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
/** "Morning_Run-2026.gpx" → "Morning Run 2026" (only a suggestion; people rename it). */
const nameFromFile = (file: string) =>
  file
    .replace(/\.gpx$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);

/** Tags someone can give their own route ("Testing" is for the app's own test routes). */
const TAG_CHOICES = Object.entries(ROUTE_TAGS).filter(([id]) => id !== 'testing');

export default function AddRoute({ draft: resumed = null, onDone }: Props) {
  const [stage, setStage] = useState<Stage>(resumed ? 'turns' : 'pick');
  const [draft, setDraft] = useState<Draft | null>(resumed);
  const [error, setError] = useState<string | null>(null);

  // Keep the draft on the device whenever it changes (a moment after the last change).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draft) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void draftStore().put(draft), 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft]);

  const update = (patch: Partial<Draft['data']>) => setDraft((d) => (d ? { ...d, data: { ...d.data, ...patch } } : d));

  return (
    <section className="acct-card add-route" aria-labelledby="add-route-title">
      <h2 id="add-route-title" className="acct__h2">
        {stage === 'saved' ? 'Route saved' : 'Add a route'}
      </h2>
      {stage !== 'saved' && stage !== 'building' && <Steps stage={stage} />}
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}

      {(stage === 'pick' || stage === 'building') && (
        <PickAndBuild
          building={stage === 'building'}
          onBuild={async (text, name, trim, onStep) => {
            setError(null);
            setStage('building');
            try {
              const built = await buildDraft(text, name, postApi, { trim, onStep });
              await draftStore().put(built);
              setDraft(built);
              setStage('turns');
            } catch (err) {
              setError(errorText(err));
              setStage('pick');
            }
          }}
          onCancel={onDone}
        />
      )}

      {stage === 'turns' && draft && (
        <TurnsStep
          draft={draft}
          onTurns={(turns) => update({ turns })}
          onStartStreet={(startStreet) => update({ startStreet })}
          onNext={() => {
            setError(null);
            setStage('details');
          }}
          onLater={onDone}
        />
      )}

      {stage === 'details' && draft && (
        <DetailsStep
          draft={draft}
          onChange={update}
          onBack={() => setStage('turns')}
          onSave={async () => {
            setError(null);
            // Tidy the free text on the way out (the server refuses spaces at the ends and empty lines).
            const d = draft.data;
            const data = {
              ...d,
              name: d.name.trim(),
              place: d.place?.trim() || undefined,
              description: d.description?.trim() || undefined,
              notes: d.notes.map((n) => n.trim()).filter(Boolean),
              startStreet: d.startStreet?.trim() ?? '',
              turns: normalizeTurns(d.turns),
            };
            try {
              await saveMyRoute(uploadBody({ ...draft, data }));
              await draftStore().remove(draft.id);
              setStage('saved');
            } catch (err) {
              const problems = err instanceof ApiError && Array.isArray(err.body.problems) ? (err.body.problems as string[]) : [];
              setError(problems.length ? `${errorText(err)} ${problems.slice(0, 3).join('; ')}.` : errorText(err));
            }
          }}
        />
      )}

      {stage === 'saved' && draft && (
        <>
          <p>
            <strong>{draft.data.name}</strong> is in your routes ({km(draft.data.stats.distanceM)}). Only you can see it.
          </p>
          <button type="button" className="btn btn--primary btn--block" onClick={onDone}>
            DONE
          </button>
        </>
      )}
    </section>
  );
}

function Steps({ stage }: { stage: Stage }) {
  const steps: [Stage, string][] = [
    ['pick', 'File'],
    ['turns', 'Turns'],
    ['details', 'Details'],
  ];
  const at = steps.findIndex(([s]) => s === stage);
  return (
    <ol className="add-route__steps" aria-label="Steps">
      {steps.map(([s, label], i) => (
        <li key={s} aria-current={i === at ? 'step' : undefined} className={i < at ? 'is-done' : i === at ? 'is-current' : undefined}>
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

// ---------- 1. the file ----------

function PickAndBuild({
  building,
  onBuild,
  onCancel,
}: {
  building: boolean;
  onBuild: (text: string, name: string, trim: { startM: number; endM: number }, onStep: (s: BuildStep, done?: number, total?: number) => void) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [startM, setStartM] = useState(0);
  const [endM, setEndM] = useState(0);
  const [progress, setProgress] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return setProblem('Choose a GPX file.');
    if (!name.trim()) return setProblem('Give the route a name.');
    setProblem(null);
    const text = await file.text();
    onBuild(text, name.trim(), { startM, endM }, (step, done, total) =>
      setProgress(
        step === 'cleaning'
          ? 'Cleaning the file on this device…'
          : step === 'elevation'
            ? `Looking up elevation${done !== undefined && total ? ` (${Math.round((100 * done) / total)} %)` : ''}…`
            : step === 'streets'
              ? 'Looking up street names… The street-name service is often busy; this can take a minute.'
              : 'Finding the turns…',
      ),
    );
  };

  if (building) {
    return (
      <p className="add-route__progress" role="status" aria-live="polite">
        {progress || 'Starting…'}
      </p>
    );
  }

  return (
    <form className="add-route__form" onSubmit={(e) => void submit(e)}>
      <label className="acct-field">
        <span>GPX file</span>
        <input
          type="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f && !name) setName(nameFromFile(f.name));
          }}
        />
      </label>
      <p className="acct-small">
        The file is cleaned on this device first: times, heart rate, device details and names are removed, and the original
        never leaves your phone or computer. Only the positions are kept.
      </p>
      <label className="acct-field">
        <span>Route name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} />
      </label>
      <fieldset className="add-route__trim">
        <legend>Starts or ends at home?</legend>
        <p className="acct-small">A recorded run usually starts at your door. Trimming the first and last metres keeps where you live out of the route.</p>
        <label className="acct-field">
          <span>Trim from the start</span>
          <select value={startM} onChange={(e) => setStartM(Number(e.target.value))}>
            {TRIM_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m ? `${m} m` : 'Nothing'}
              </option>
            ))}
          </select>
        </label>
        <label className="acct-field">
          <span>Trim from the end</span>
          <select value={endM} onChange={(e) => setEndM(Number(e.target.value))}>
            {TRIM_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m ? `${m} m` : 'Nothing'}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      {problem && (
        <p className="acct-error" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block">
        BUILD THE ROUTE
      </button>
      <button type="button" className="btn btn--secondary btn--small" onClick={onCancel}>
        CANCEL
      </button>
    </form>
  );
}

// ---------- 2. the turns ----------

function TurnsStep({
  draft,
  onTurns,
  onStartStreet,
  onNext,
  onLater,
}: {
  draft: Draft;
  onTurns: (turns: Turn[]) => void;
  onStartStreet: (street: string) => void;
  onNext: () => void;
  onLater: () => void;
}) {
  const { data } = draft;
  const problems = validateTurns(normalizeTurns(data.turns), data.stats.distanceM);
  return (
    <div className="add-route__turns">
      <p>
        <strong>{data.name}</strong>: {km(data.stats.distanceM)}, {data.stats.gainM} m of climb, {data.turns.length} turns found.
      </p>
      {draft.removed.length > 0 && <p className="acct-small">Removed from the file before anything was sent: {draft.removed.join(', ')}.</p>}
      {(draft.trimmed.startM > 0 || draft.trimmed.endM > 0) && (
        <p className="acct-small">
          Trimmed {draft.trimmed.startM} m from the start and {draft.trimmed.endM} m from the end.
        </p>
      )}
      {draft.streetsMissing && (
        <p className="acct-error">The street-name service didn’t answer, so the turns have no street names. Add them below, or leave them blank.</p>
      )}
      {draft.startNote && <p className="re-problem">{draft.startNote}</p>}
      {ROUTE_MAPS && !insideMapArea(data.bbox) && (
        <p className="acct-small">This route is outside the offline map (Montréal to Québec City): it works, but its map will show only the route line.</p>
      )}
      <p className="acct-small">
        These turns are a first guess. Check each one against the map: the direction, and the street you turn onto. Delete
        any that aren’t real turns, and tap the route to add a missing one.
      </p>
      <label className="acct-field">
        <span>Street at the start (“Continue on …”)</span>
        <input value={data.startStreet ?? ''} onChange={(e) => onStartStreet(e.target.value)} />
      </label>
      <TurnEditor data={data} track={draft.track} candidates={draft.review} recorded={draft.recorded} turns={data.turns} onChange={onTurns} />
      {problems.length > 0 && (
        <ul className="acct-error">
          {problems.slice(0, 3).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn--primary btn--block" disabled={problems.length > 0} onClick={onNext}>
        NEXT: NAME AND DETAILS
      </button>
      <button type="button" className="btn btn--secondary btn--small" onClick={onLater}>
        FINISH LATER
      </button>
      <p className="acct-small">“Finish later” keeps this route on this device only, unsaved.</p>
    </div>
  );
}

// ---------- 3. name and details ----------

function DetailsStep({
  draft,
  onChange,
  onBack,
  onSave,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft['data']>) => void;
  onBack: () => void;
  onSave: () => Promise<void>;
}) {
  const { data } = draft;
  const [saving, setSaving] = useState(false);
  const description = data.description ?? '';
  const problem =
    !data.name.trim()
      ? 'Give the route a name.'
      : (validateDescription(description.trim() || undefined)[0] ?? null);
  const set = (key: 'place' | 'description', value: string) => onChange({ [key]: value || undefined });
  const tags = data.tags ?? [];

  return (
    <form
      className="add-route__form"
      onSubmit={(e) => {
        e.preventDefault();
        if (problem) return;
        setSaving(true);
        void onSave().finally(() => setSaving(false));
      }}
    >
      <label className="acct-field">
        <span>Name</span>
        <input value={data.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={NAME_MAX} required />
      </label>
      <label className="acct-field">
        <span>Where (optional)</span>
        <input value={data.place ?? ''} onChange={(e) => set('place', e.target.value)} maxLength={PLACE_MAX} placeholder="Plateau · starts on Rue Rachel" />
      </label>
      <label className="acct-field">
        <span>What it’s like (optional)</span>
        <textarea value={description} onChange={(e) => set('description', e.target.value)} maxLength={DESCRIPTION_MAX} rows={3} />
      </label>
      <fieldset className="add-route__tags">
        <legend>Tags (optional)</legend>
        {TAG_CHOICES.map(([id, tag]) => (
          <label key={id} className="acct-check">
            <input
              type="checkbox"
              checked={tags.includes(id)}
              onChange={(e) => {
                const next = e.target.checked ? [...tags, id] : tags.filter((t) => t !== id);
                onChange({ tags: next.length ? next : undefined });
              }}
            />
            <span>{tag.label}</span>
          </label>
        ))}
      </fieldset>
      <label className="acct-field">
        <span>Notes (optional, one per line)</span>
        <textarea
          value={data.notes.join('\n')}
          onChange={(e) => onChange({ notes: e.target.value.split('\n') })}
          rows={3}
          placeholder="Water fountain at km 3"
        />
      </label>
      {problem && (
        <p className="acct-error" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block" disabled={!!problem || saving}>
        {saving ? 'SAVING…' : 'SAVE TO MY ROUTES'}
      </button>
      <button type="button" className="btn btn--secondary btn--small" onClick={onBack}>
        BACK TO THE TURNS
      </button>
    </form>
  );
}
