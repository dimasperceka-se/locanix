"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
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
};

const DEFAULT_NAME = "[User Name]";
const DEFAULT_EMAIL = "username1234352@gmail.com";

const Ctx = createContext<PlotStore | null>(null);

const STORAGE_KEY = "locanix.plots";

export function PlotStoreProvider({ children }: { children: React.ReactNode }) {
  const [plots, setPlotsState] = useState<Plot[]>([]);
  const [eudrDone, setEudrDoneState] = useState(false);
  const [analyses, setAnalysesState] = useState<AnalysisKey[]>(ALL_ANALYSIS_KEYS);

  // Ephemeral v1.1 flow state (context-only; resets on hard refresh).
  const [isBulk, setIsBulk] = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);
  const [survey, setSurveyState] = useState<SurveyData | null>(null);
  const [userName, setUserName] = useState(DEFAULT_NAME);
  const [userEmail, setUserEmail] = useState(DEFAULT_EMAIL);

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

  // Hydrate plots from sessionStorage so a refresh on /dashboard keeps the data.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { plots: Plot[]; eudrDone: boolean };
        setPlotsState(parsed.plots ?? []);
        setEudrDoneState(parsed.eudrDone ?? false);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const persist = useCallback((next: Plot[], done: boolean) => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ plots: next, eudrDone: done }),
      );
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  const setPlots = useCallback(
    (next: Plot[]) => {
      setPlotsState(next);
      setEudrDoneState(false);
      persist(next, false);
    },
    [persist],
  );

  const addPlots = useCallback(
    (extra: Plot[]) => {
      setPlotsState((prev) => {
        // Plot ids restart after a page reload, so renumber appended plots past
        // the current maximum to keep ids unique (rows, selection, detail links).
        let maxId = prev.reduce((m, p) => Math.max(m, p.id), 0);
        const next = [...prev, ...extra.map((p) => ({ ...p, id: ++maxId }))];
        persist(next, false);
        return next;
      });
      setEudrDoneState(false);
    },
    [persist],
  );

  // Replace plots while preserving the eudrDone flag (used to write EUDR results).
  const updatePlots = useCallback(
    (next: Plot[]) => {
      setPlotsState(next);
      setEudrDoneState((done) => {
        persist(next, done);
        return done;
      });
    },
    [persist],
  );

  const clear = useCallback(() => {
    setPlotsState([]);
    setEudrDoneState(false);
    setAnalysesState(ALL_ANALYSIS_KEYS);
    setIsBulk(false);
    setSurveyDone(false);
    setSurveyState(null);
    setUserName(DEFAULT_NAME);
    setUserEmail(DEFAULT_EMAIL);
    persist([], false);
  }, [persist]);

  const setEudrDone = useCallback(
    (done: boolean) => {
      setEudrDoneState(done);
      setPlotsState((prev) => {
        persist(prev, done);
        return prev;
      });
    },
    [persist],
  );

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
