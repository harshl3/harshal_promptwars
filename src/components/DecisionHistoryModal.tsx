import React, { useState } from "react";
import {
  History,
  X,
  Trash2,
  ExternalLink,
  Search,
  Calendar,
  Cloud,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import type { SavedDecisionRecord } from "../types/decision";
import { testFirestoreConnection } from "../services/firebase";

interface DecisionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: SavedDecisionRecord[];
  onSelectRecord: (record: SavedDecisionRecord) => void;
  onDeleteRecord: (id: string) => void;
  source: "firestore" | "local";
}

export const DecisionHistoryModal: React.FC<DecisionHistoryModalProps> = ({
  isOpen,
  onClose,
  records,
  onSelectRecord,
  onDeleteRecord,
  source
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [testingDb, setTestingDb] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTestingDb(true);
    setTestResult(null);
    try {
      const res = await testFirestoreConnection();
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ connected: false, message: e.message || "Failed test" });
    } finally {
      setTestingDb(false);
    }
  };

  const filtered = records.filter(
    (r) =>
      (r.input?.decision || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.input?.context || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.reflection?.notes || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/75 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-modal-title"
    >
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-stone-200 dark:border-zinc-800 shadow-2xl max-w-3xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-200 dark:border-zinc-800 flex items-center justify-between bg-stone-50 dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-600/30">
              <History className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h2 id="history-modal-title" className="text-lg font-bold font-heading text-stone-900 dark:text-white">
                Decision History
              </h2>
              <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                <span>{records.length} records</span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  {source === "firestore" ? (
                    <>
                      <Cloud className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Firebase Cloud Firestore</span>
                    </>
                  ) : (
                    <>
                      <HardDrive className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-amber-600 dark:text-amber-400">Local Cache (Cloud Sync Pending)</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestConnection}
              disabled={testingDb}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 text-xs font-semibold hover:border-indigo-400 transition-colors cursor-pointer"
              title="Test Cloud Firestore connection"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${testingDb ? "animate-spin" : ""}`} />
              <span>{testingDb ? "Pinging..." : "Test Firestore"}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Close dialog"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Database Diagnostic Status Alert if tested or warning */}
        {testResult && (
          <div className={`px-6 py-2.5 text-xs flex items-center gap-2 border-b ${
            testResult.connected
              ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              : "bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
          }`}>
            {testResult.connected ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span className="font-medium">{testResult.message}</span>
          </div>
        )}

        {/* Search */}
        <div className="px-6 py-3 border-b border-stone-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search previous decisions, reflections, or contexts..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/70 dark:bg-zinc-800/80 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Record list */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3.5 bg-stone-50/40 dark:bg-zinc-950/40">
          {records.length === 0 ? (
            <div className="py-12 text-center text-stone-400 dark:text-stone-500 space-y-2">
              <History className="w-10 h-10 mx-auto text-stone-300 dark:text-zinc-700 stroke-1" />
              <p className="text-sm font-bold text-stone-700 dark:text-stone-300">No decision records yet</p>
              <p className="text-xs max-w-sm mx-auto text-stone-500 dark:text-stone-400">
                When you examine a decision in the Studio and save your reflection, your records will be stored here.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-stone-400 text-xs">
              No decisions match your search keyword "{searchTerm}".
            </div>
          ) : (
            filtered.map((record) => {
              const title = record.input?.decision || "Untitled Decision";
              const dateStr = record.createdAt
                ? new Date(record.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  })
                : "Recent";

              return (
                <div
                  key={record.id}
                  className="p-5 rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-850 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all space-y-3"
                >
                  {/* Top row: Title and actions */}
                  <div className="flex items-start justify-between gap-4">
                    <h3 
                      onClick={() => {
                        onSelectRecord(record);
                        onClose();
                      }}
                      className="font-bold text-stone-900 dark:text-white text-sm sm:text-base cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors leading-snug flex-1"
                    >
                      {title}
                    </h3>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          onSelectRecord(record);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-colors cursor-pointer border border-indigo-200/60 dark:border-indigo-800"
                        title="Open this analysis in Decision Studio"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRecord(record.id);
                        }}
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
                        title="Delete record"
                        aria-label="Delete decision record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Middle row: Context or reflection note */}
                  {record.reflection?.notes ? (
                    <p className="text-xs text-stone-600 dark:text-stone-300 italic bg-stone-50 dark:bg-zinc-800/80 p-2.5 rounded-xl border border-stone-100 dark:border-zinc-700/60 line-clamp-2">
                      "{record.reflection.notes}"
                    </p>
                  ) : record.input?.context ? (
                    <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2">
                      {record.input.context}
                    </p>
                  ) : null}

                  {/* Bottom row: Badges and metadata */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-stone-100 dark:border-zinc-800 text-xs text-stone-500 dark:text-stone-400">
                    <span className="flex items-center gap-1 text-[11px] font-medium">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      {dateStr}
                    </span>

                    <span>•</span>

                    <span className="text-[11px] text-stone-600 dark:text-stone-300 font-medium">
                      {record.input?.options?.length || 0} options evaluated
                    </span>

                    {record.reflection?.state && (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800">
                        {record.reflection.state.replace("_", " ").toUpperCase()}
                      </span>
                    )}

                    {record.challengeResult && (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800">
                        CHALLENGE EXAMINED
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 dark:bg-zinc-950 border-t border-stone-200 dark:border-zinc-800 flex items-center justify-between">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {source === "firestore"
              ? "Signed in with Google — synced across your devices."
              : "Saved on this device. Sign in with Google to sync with Cloud Firestore."}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-900 dark:bg-zinc-700 hover:bg-stone-800 dark:hover:bg-zinc-600 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
