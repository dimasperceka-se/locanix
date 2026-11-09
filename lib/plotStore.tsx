"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Plot } from "./geo";
import { ALL_ANALYSIS_KEYS, type AnalysisKey } from "./data";

export type SurveyData = Record<string, string>;

type PlotStore = {
  plots: Plot[];
  userName: string;
  userEmail: string;
  eudrDone: boolean;
  analyses: AnalysisKey[];
  isBulk: boolean;
  surveyDone: boolean;
  survey: SurveyData | null;
  /** True once the signed-in user's saved workspace has been loaded (or there is none to load). */
  workspaceLoaded: boolean;
  setPlots: (plots: Plot[]) => void;
  addPlots: (plots: Plot[]) => void;
  updatePlots: (plots: Plot[]) => void;
  clear: () => void;
  setEudrDone: (done: boolean) => void;
  setAnalyses: (analyses: AnalysisKey[]) => void;
  setIsBulk: (bulk: boolean) => void;
  setSurveyDone: (done: boolean) => void;
  setSurvey: (data: SurveyData) => void;
  refreshUser: () => void;
  /** Fetch the saved workspace from the server once per session (safe to call repeatedly). */
  loadWorkspace: () => Promise<void>;
  /** Send any unsaved change now (call before logging out). */
  flushWorkspace: () => Promise<void>;
};

type WorkspaceState = { plots: Plot[]; eudrDone: boolean };
type Cached = WorkspaceState & { updatedAt?: number; owner?: string };

const DEFAULT_NAME = "[User Name]";
const DEFAULT_EMAIL = "username1234352@gmail.com";
const STORAGE_KEY = "locanix.plots";
const SAVE_DELAY_MS = 400;

const Ctx = createContext<PlotStore | null>(null);

function readCache(): Cached | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

function writeCache(value: Cached) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage may be unavailable or full; the server copy still holds the data */
  }
}

/** Union of both copies; for a plot present in both, the local version (newer results) wins. */
function merge(server: WorkspaceState, local: WorkspaceState): WorkspaceState {
  const key = (p: Plot) => `${p.plotId}|${p.ring[0]?.join(",")}|${p.areaHa.toFixed(4)}`;
  const byKey = new Map(server.plots.map((p) => [key(p), p]));
  for (const p of local.plots) byKey.set(key(p), p);
  return { plots: [...byKey.values()].map((p, i) => ({ ...p, id: i + 1 })), eudrDone: server.eudrDone || local.eudrDone };
}

/**
 * Plots and EUDR results for the signed-in user. The server (PostgreSQL, with a file
 * mirror) is the record, so results survive reloads, new tabs and other devices;
 * sessionStorage is only a fast local cache.
 */
export function PlotStoreProvider({ children }: { children: React.ReactNode }) {
  const [plots, setPlotsState] = useState<Plot[]>([]);
  const [eudrDone, setEudrDoneState] = useState(false);
  const [analyses, setAnalysesState] = useState<AnalysisKey[]>(ALL_ANALYSIS_KEYS);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  // Ephemeral flow state (context-only; resets on hard refresh).
  const [isBulk, setIsBulk] = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);
  const [survey, setSurveyState] = useState<SurveyData | null>(null);
  const [userName, setUserName] = useState(DEFAULT_NAME);
  const [userEmail, setUserEmail] = useState(DEFAULT_EMAIL);

  const stateRef = useRef<WorkspaceState>({ plots: [], eudrDone: false });
  const ownerRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const loadingRef = useRef<Promise<void> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on logout so a load that was in flight is ignored.
  const generationRef = useRef(0);

  const apply = useCallback((next: WorkspaceState, updatedAt: number) => {
    stateRef.current = next;
    setPlotsState(next.plots);
    setEudrDoneState(next.eudrDone);
    writeCache({ ...next, updatedAt, owner: ownerRef.current ?? undefined });
  }, []);

  const pushNow = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (!ownerRef.current) return;
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stateRef.current),
      });
      if (res.ok) {
        const { updatedAt } = (await res.json()) as { updatedAt: number };
        const cached = readCache();
        if (cached) writeCache({ ...cached, updatedAt });
      }
    } catch {
      /* offline: the cache keeps the change and the next load merges it */
    }
  }, []);

  const schedulePush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void pushNow(), SAVE_DELAY_MS);
  }, [pushNow]);

  const loadWorkspace = useCallback((): Promise<void> => {
    if (loadedRef.current) return Promise.resolve();
    if (loadingRef.current) return loadingRef.current;
    const generation = generationRef.current;
    loadingRef.current = (async () => {
      try {
        const res = await fetch("/api/workspace", { cache: "no-store" });
        if (generation !== generationRef.current) return;
        if (!res.ok) return; // signed out (401) or unavailable: stay local
        const data = (await res.json()) as { owner: string; workspace: (WorkspaceState & { updatedAt: number }) | null };
        ownerRef.current = data.owner;
        const cached = readCache();
        // Ignore a cache left behind by another account in this tab.
        const local = cached && cached.plots?.length && (!cached.owner || cached.owner === data.owner) ? cached : null;
        const server = data.workspace;
        loadedRef.current = true;
        if (!server) {
          apply(local ?? { plots: [], eudrDone: false }, local?.updatedAt ?? 0);
          if (local) schedulePush();
        } else if (!local || (local.updatedAt ?? 0) <= server.updatedAt) {
          apply({ plots: server.plots, eudrDone: server.eudrDone }, server.updatedAt);
        } else {
          // Local changes the server hasn't seen (made before loading, or a failed save).
          apply(merge(server, local), Date.now());
          schedulePush();
        }
      } catch {
        /* network error: keep what we have */
      } finally {
        loadingRef.current = null;
        if (generation === generationRef.current) setWorkspaceLoaded(true);
      }
    })();
    return loadingRef.current;
  }, [apply, schedulePush]);

  /** Every change: update state and cache now, save to the server shortly after. */
  const commit = useCallback(
    (next: WorkspaceState) => {
      apply(next, Date.now());
      if (loadedRef.current) schedulePush();
      else void loadWorkspace(); // merges this change into the saved workspace, then saves
    },
    [apply, loadWorkspace, schedulePush],
  );

  const flushWorkspace = useCallback(async () => {
    if (saveTimer.current) await pushNow();
  }, [pushNow]);

  // Show the cached copy immediately after a reload, before the server answers.
  useEffect(() => {
    const cached = readCache();
    if (cached?.plots) {
      stateRef.current = { plots: cached.plots, eudrDone: cached.eudrDone ?? false };
      setPlotsState(cached.plots);
      setEudrDoneState(cached.eudrDone ?? false);
    }
    // Last chance to save a pending change when the tab is closed or reloaded.
    const onHide = () => {
      if (!saveTimer.current || !ownerRef.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      navigator.sendBeacon?.("/api/workspace", new Blob([JSON.stringify(stateRef.current)], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // Load the signed-in user's real name/email (called by the navbars on mount).
  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { name?: string; email?: string };
      if (data.name) setUserName(data.name);
      if (data.email) setUserEmail(data.email);
    } catch {
      /* ignore */
    }
  }, []);

  const setAnalyses = useCallback(
    (next: AnalysisKey[]) => setAnalysesState(next.length ? next : ALL_ANALYSIS_KEYS),
    [],
  );
  const setSurvey = useCallback((data: SurveyData) => {
    setSurveyState(data);
    setSurveyDone(true);
  }, []);

  const setPlots = useCallback((next: Plot[]) => commit({ plots: next, eudrDone: false }), [commit]);

  const addPlots = useCallback(
    (extra: Plot[]) => {
      // Ids restart after a reload, so renumber appended plots past the current
      // maximum to keep ids unique (rows, selection, detail links).
      let maxId = stateRef.current.plots.reduce((m, p) => Math.max(m, p.id), 0);
      commit({ plots: [...stateRef.current.plots, ...extra.map((p) => ({ ...p, id: ++maxId }))], eudrDone: false });
    },
    [commit],
  );

  // Replace plots while preserving the eudrDone flag (used to write EUDR results).
  const updatePlots = useCallback((next: Plot[]) => commit({ plots: next, eudrDone: stateRef.current.eudrDone }), [commit]);

  const setEudrDone = useCallback((done: boolean) => commit({ plots: stateRef.current.plots, eudrDone: done }), [commit]);

  /** Log-out reset: forget the local copy; the saved workspace stays on the server. */
  const clear = useCallback(() => {
    generationRef.current++;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    loadedRef.current = false;
    loadingRef.current = null;
    ownerRef.current = null;
    stateRef.current = { plots: [], eudrDone: false };
    setPlotsState([]);
    setEudrDoneState(false);
    setWorkspaceLoaded(false);
    setAnalysesState(ALL_ANALYSIS_KEYS);
    setIsBulk(false);
    setSurveyDone(false);
    setSurveyState(null);
    setUserName(DEFAULT_NAME);
    setUserEmail(DEFAULT_EMAIL);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        plots,
        userName,
        userEmail,
        eudrDone,
        analyses,
        isBulk,
        surveyDone,
        survey,
        workspaceLoaded,
        setPlots,
        addPlots,
        updatePlots,
        clear,
        setEudrDone,
        setAnalyses,
        setIsBulk,
        setSurveyDone,
        setSurvey,
        refreshUser,
        loadWorkspace,
        flushWorkspace,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePlotStore(): PlotStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlotStore must be used within PlotStoreProvider");
  return ctx;
}
