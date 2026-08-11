import { useCallback, useEffect, useState } from "react";

import { downloadExport, fetchExtensions, fetchLargestFiles, fetchReportSummary, type ExtensionReport, type LargestFile, type ReportSummary } from "../api/reports";
import type { AuthenticatedFetch } from "../api/status";

interface ReportState {
  summary?: ReportSummary;
  largest: LargestFile[];
  extensions?: ExtensionReport;
  loading: boolean;
  exporting?: "json" | "csv";
  error?: string;
  retry(): void;
  exportAs(format: "json" | "csv"): Promise<void>;
}

export function useReports(fetcher: AuthenticatedFetch, scanID: string, rootID: number, enabled: boolean): ReportState {
  const [summary, setSummary] = useState<ReportSummary>();
  const [largest, setLargest] = useState<LargestFile[]>([]);
  const [extensions, setExtensions] = useState<ExtensionReport>();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"json" | "csv">();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setSummary(undefined);
      setLargest([]);
      setExtensions(undefined);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    void Promise.all([
      fetchReportSummary(fetcher, scanID, rootID, controller.signal),
      fetchLargestFiles(fetcher, scanID, rootID, controller.signal),
      fetchExtensions(fetcher, scanID, rootID, controller.signal),
    ]).then(([nextSummary, nextLargest, nextExtensions]) => {
      setSummary(nextSummary);
      setLargest(nextLargest);
      setExtensions(nextExtensions);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Reports could not be loaded");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [enabled, fetcher, revision, rootID, scanID]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  const exportAs = useCallback(async (format: "json" | "csv") => {
    setExporting(format);
    setError(undefined);
    try {
      await downloadExport(fetcher, scanID, rootID, format);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Export failed");
    } finally {
      setExporting(undefined);
    }
  }, [fetcher, rootID, scanID]);

  return { summary, largest, extensions, loading, exporting, error, retry, exportAs };
}
