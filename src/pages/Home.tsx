import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { PdfCanvas } from "../components/PdfCanvas";
import { TextOverlay, type OverlayBox } from "../components/TextOverlay";
import { SignaturePad } from "../components/SignaturePad";
import { DocumentEditor } from "../components/DocumentEditor";
import { ToolRail, type RailTool } from "../components/ToolRail";
import { BottomBar } from "../components/BottomBar";
import { CommandPalette } from "../components/CommandPalette";
import { PageThumbs } from "../components/PageThumbs";
import { Icon } from "../components/Icon";
import { DocumentHeader } from "../components/DocumentHeader";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { PrivacyTrust } from "../components/PrivacyTrust";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { Breadcrumbs, ToolPageLayout } from "../components/ToolPage";
import { UploadDropzone } from "../components/UploadDropzone";
import { usePdf } from "../store/PdfContext";
import { extractDocumentHtml } from "../lib/pdfjs";
import {
  bakeTextOverlays,
  compressPdf,
  compressionTargetRatio,
  deletePages,
  extractPages,
  htmlToPdf,
  mergePdfs,
  rotatePages,
  toGrayscalePdf,
} from "../lib/pdfOps";
import { encryptPdf } from "../lib/qpdf";
import { downloadBytes, stem } from "../lib/download";
import { FileTooLargeError, assertPdfFileSize } from "../lib/fileGate";
import { usePageUndo } from "../hooks/usePageUndo";
import { usePdfDoc } from "../hooks/usePdfDoc";
import { formatFileSize } from "../lib/format";

type PanelId = "rotate" | "compress" | "protect" | "unlock" | "pages" | "merge" | null;
type JobId = "compress" | "sign" | "rotate" | "merge" | "protect" | "unlock" | "hide" | "pages" | "bw" | "text" | "master";
const JOBS: { id: JobId; icon: string; title: string; about: string; color: string }[] = [
  { id: "compress", icon: "compress", title: "tool_compress", about: "job_compress", color: "bg-blue-50 text-blue-600 border-blue-200/80" },
  { id: "merge", icon: "merge", title: "tool_merge", about: "job_merge", color: "bg-indigo-50 text-indigo-600 border-indigo-200/80" },
  { id: "rotate", icon: "rotate", title: "tool_rotate", about: "job_rotate", color: "bg-cyan-50 text-cyan-600 border-cyan-200/80" },
  { id: "protect", icon: "protect", title: "tool_protect", about: "job_protect", color: "bg-amber-50 text-amber-600 border-amber-200/80" },
  { id: "unlock", icon: "unlock", title: "tool_unlock", about: "job_unlock", color: "bg-emerald-50 text-emerald-600 border-emerald-200/80" },
  { id: "hide", icon: "hide", title: "tool_hide", about: "job_hide", color: "bg-rose-50 text-rose-600 border-rose-200/80" },
  { id: "pages", icon: "pages", title: "tool_pages", about: "job_pages", color: "bg-purple-50 text-purple-600 border-purple-200/80" },
  { id: "sign", icon: "sign", title: "tool_sign", about: "job_sign", color: "bg-teal-50 text-teal-600 border-teal-200/80" },
  { id: "text", icon: "text", title: "tool_text_editor", about: "job_text", color: "bg-sky-50 text-sky-600 border-sky-200/80" },
  { id: "bw", icon: "bw", title: "tool_bw", about: "job_bw", color: "bg-slate-100 text-slate-700 border-slate-200/80" },
];

export function Home() {
  const { t } = useTranslation();
  const {
    bytes,
    name,
    page,
    pageCount,
    setPage,
    setBytes,
    showToast,
    log,
    extraMergeBytes,
    addMergeFile,
    clearMerge,
    busy,
    clear,
    session,
  } = usePdf();

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [overlays, setOverlays] = useState<OverlayBox[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [lockPw, setLockPw] = useState("");
  const [lockPw2, setLockPw2] = useState("");
  const [view, setView] = useState<"page" | "document">("page");
  const [docHtml, setDocHtml] = useState("");
  const [docKey, setDocKey] = useState(0);
  const [hasSelectableText, setHasSelectableText] = useState(true);
  const [compressCompare, setCompressCompare] = useState<{ before: number; after: number } | null>(null);
  const [tool, setTool] = useState<"select" | "text" | "hide" | "sign">("select");
  const [panel, setPanel] = useState<PanelId>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [docInfoOpen, setDocInfoOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 768
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [railCollapsed, setRailCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches
  );
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotateDir, setRotateDir] = useState<90 | 270>(90);
  const [rotateScope, setRotateScope] = useState<"page" | "all">("page");
  const [compressAmount, setCompressAmount] = useState(50);
  const uploadBytesRef = useRef<Uint8Array | null>(null);
  const [uploadSize, setUploadSize] = useState<number | null>(null);
  const [bwDone, setBwDone] = useState(false);
  const [working, setWorking] = useState(false);
  const [workLabel, setWorkLabel] = useState("");
  const [job, setJob] = useState<JobId | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const morePos = useRef({ top: 48, right: 16 });
  const fittedWidth = useRef({ box: 0, page: 0 });
  const pageHist = usePageUndo();
  const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const { pdf, loading } = usePdfDoc(bytes);

  const onRendered = useCallback((s: { width: number; height: number }) => {
    setSize(s);
  }, []);

  useEffect(() => {
    if (!bytes) {
      uploadBytesRef.current = null;
      setUploadSize(null);
      setBwDone(false);
      return;
    }
    if (!uploadBytesRef.current) {
      uploadBytesRef.current = bytes.slice();
      setUploadSize(bytes.byteLength);
    }
  }, [bytes, session]);

  useEffect(() => {
    if (!bytes) {
      setDocHtml("");
      return;
    }
    let live = true;
    void extractDocumentHtml(bytes).then((r) => {
      if (!live) return;
      setDocHtml(r.html);
      setHasSelectableText(r.hasText);
      setDocKey((k) => k + 1);
    });
    return () => {
      live = false;
    };
  }, [bytes]);

  const snapshotPage = useCallback(() => {
    if (bytes) pageHist.push(bytes, overlays, page);
  }, [bytes, overlays, page, pageHist]);

  const undoPage = useCallback(async () => {
    if (!bytes) return;
    const prev = pageHist.popUndo({ bytes, overlays, page });
    if (!prev) return;
    setOverlays(prev.overlays);
    setActiveId(null);
    await setBytes(prev.bytes, name);
    setPage(prev.page);
    log(t("undone"));
  }, [bytes, overlays, page, pageHist, setBytes, name, setPage, log, t]);

  const redoPage = useCallback(async () => {
    if (!bytes) return;
    const next = pageHist.popRedo({ bytes, overlays, page });
    if (!next) return;
    setOverlays(next.overlays);
    setActiveId(null);
    await setBytes(next.bytes, name);
    setPage(next.page);
    log(t("redone"));
  }, [bytes, overlays, page, pageHist, setBytes, name, setPage, log, t]);

  const apply = useCallback(
    async (fn: () => Promise<Uint8Array>) => {
      if (!bytes || working) return;
      snapshotPage();
      setWorkLabel(t("working"));
      setWorking(true);
      try {
        const out = await fn();
        await setBytes(out, name);
        log(t("preview_updated"));
        setPanel(null);
        return true;
      } catch {
        pageHist.dropLast();
        showToast("error", t("error"));
        return false;
      } finally {
        setWorking(false);
      }
    },
    [bytes, working, snapshotPage, setBytes, name, log, t, pageHist, showToast]
  );

  const runBw = () => {
    if (!bytes || bwDone || working) return;
    const source = uploadBytesRef.current ?? bytes;
    void apply(() => toGrayscalePdf(source)).then((ok) => {
      if (ok) setBwDone(true);
    });
  };

  const applyEditsToPreview = useCallback(async () => {
    if (!bytes || working) return;
    if (!overlays.length) return;
    snapshotPage();
    setWorkLabel(t("working"));
    setWorking(true);
    try {
      const next = await bakeTextOverlays(
        bytes,
        overlays.map((b) => ({
          kind: b.kind,
          pageIndex: b.pageIndex,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          html: b.html,
          src: b.src,
          fontSize: b.fontSize,
          fontFamily: b.fontFamily,
          pageWidth: size.width || 1,
          pageHeight: size.height || 1,
        }))
      );
      await setBytes(next, name);
      setOverlays([]);
      setActiveId(null);
      log(t("preview_updated"));
    } catch {
      pageHist.dropLast();
      showToast("error", t("error"));
    } finally {
      setWorking(false);
    }
  }, [bytes, working, overlays, snapshotPage, size, setBytes, name, log, t, pageHist, showToast]);

  const downloadCurrent = useCallback(() => {
    if (!bytes) return;
    downloadBytes(bytes, `${stem(name || "document")}.pdf`);
    log(t("log_downloaded", { name: name || "document.pdf" }));
  }, [bytes, name, log, t]);

  const addCover = useCallback(() => {
    snapshotPage();
    const id = crypto.randomUUID();
    setOverlays((b) => [
      ...b,
      {
        id,
        kind: "cover",
        pageIndex: page - 1,
        x: 28,
        y: 80,
        width: 180,
        height: 28,
        html: "",
        fontSize: 12,
        fontFamily: "helvetica",
      },
    ]);
    setActiveId(id);
  }, [snapshotPage, page]);

  const hardClear = () => {
    setOverlays([]);
    setActiveId(null);
    setDocHtml("");
    setSignOpen(false);
    setLockPw("");
    setLockPw2("");
    setSize({ width: 0, height: 0 });
    setHasSelectableText(true);
    setView("page");
    setCompressCompare(null);
    setPanel(null);
    setMoreOpen(false);
    setPaletteOpen(false);
    setZoom(1);
    setJob(null);
    setDocInfoOpen(false);
    pageHist.reset();
    clear();
  };

  const onMergeInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      assertPdfFileSize(f);
      await addMergeFile(f);
    } catch (err) {
      if (err instanceof FileTooLargeError) showToast("error", t("file_too_large"));
    }
  };

  const previewGutter = () =>
    window.matchMedia("(min-width: 768px)").matches ? 48 : window.matchMedia("(min-width: 390px)").matches ? 40 : 32;

  const fitWidth = useCallback(() => {
    const box = workspaceRef.current;
    if (!box || !size.width) return;
    const next = (box.clientWidth - previewGutter()) / size.width;
    setZoom(Math.min(2.5, Math.max(0.2, next)));
  }, [size.width]);

  const fitPage = useCallback(() => {
    const box = workspaceRef.current;
    if (!box || !size.width || !size.height) return;
    const gutter = previewGutter();
    const z = Math.min((box.clientWidth - gutter) / size.width, (box.clientHeight - gutter) / size.height);
    setZoom(Math.min(2.5, Math.max(0.2, z)));
  }, [size.width, size.height]);

  const closeUi = useCallback(() => {
    setPanel(null);
    setMoreOpen(false);
    setDocInfoOpen(false);
    setPaletteOpen(false);
    setSignOpen(false);
    setActiveId(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        closeUi();
        return;
      }
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (overlays.length) void applyEditsToPreview();
        else downloadCurrent();
        return;
      }
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        void undoPage();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        void redoPage();
      } else if (e.key === "+" || e.key === "=") {
        setZoom((z) => Math.min(2.5, z + 0.1));
      } else if (e.key === "-" || e.key === "_") {
        setZoom((z) => Math.max(0.2, z - 0.1));
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        setPage(Math.min(pageCount, page + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        setPage(Math.max(1, page - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    closeUi,
    overlays.length,
    applyEditsToPreview,
    downloadCurrent,
    undoPage,
    redoPage,
    page,
    pageCount,
    setPage,
  ]);

  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => Math.min(2.5, Math.max(0.2, z + (e.deltaY > 0 ? -0.08 : 0.08))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [bytes, view]);

  useEffect(() => {
    const box = workspaceRef.current;
    if (!box || view !== "page" || !size.width) return;
    const apply = () => {
      if (!window.matchMedia("(max-width: 767px)").matches) return;
      const boxWidth = box.clientWidth;
      if (
        Math.abs(boxWidth - fittedWidth.current.box) < 24 &&
        Math.abs(size.width - fittedWidth.current.page) < 8
      ) {
        return;
      }
      fittedWidth.current = { box: boxWidth, page: size.width };
      fitWidth();
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(box);
    return () => observer.disconnect();
  }, [size.width, fitWidth, view]);

  const onRail = (id: RailTool) => {
    if (id === "text") {
      setTool("text");
      setPanel(null);
      setView("document");
      return;
    }
    setView("page");
    if (id === "select") {
      setTool("select");
      setPanel(null);
      return;
    }
    if (id === "hide") {
      setTool("hide");
      addCover();
      return;
    }
    if (id === "sign") {
      setTool("sign");
      setSignOpen(true);
      return;
    }
    if (id === "bw") {
      setTool("select");
      runBw();
      return;
    }
    setTool("select");
    setPanel(id);
  };

  const commands = useMemo(
    () => [
      { id: "editor", label: t("tool_text_editor"), icon: "text", run: () => { setTool("text"); setView("document"); } },
      { id: "sign", label: t("sign"), icon: "sign", run: () => setSignOpen(true) },
      { id: "hide", label: t("cover_text"), icon: "hide", run: () => addCover() },
      { id: "rotate", label: t("tool_rotate"), icon: "rotate", run: () => setPanel("rotate") },
      { id: "compress", label: t("compress"), icon: "compress", run: () => setPanel("compress") },
      { id: "bw", label: t("grayscale"), icon: "bw", run: () => runBw() },
      { id: "merge", label: t("merge"), icon: "merge", run: () => setPanel("merge") },
      { id: "protect", label: t("tool_protect"), icon: "protect", run: () => setPanel("protect") },
      { id: "unlock", label: t("tool_unlock"), icon: "unlock", run: () => setPanel("unlock") },
      { id: "undo", label: t("undo"), icon: "undo", shortcut: `${modKey}+Z`, run: () => void undoPage() },
      { id: "redo", label: t("redo"), icon: "redo", shortcut: `${modKey}+Shift+Z`, run: () => void redoPage() },
      { id: "download", label: t("download"), icon: "download", shortcut: `${modKey}+S`, run: () => downloadCurrent() },
    ],
    [t, addCover, bytes, apply, downloadCurrent, undoPage, redoPage, runBw]
  );

  const panelBox = "tool-settings ui-panel border-b border-border px-4 py-3 text-sm min-[390px]:px-5";
  const field = "ui-field min-h-11 text-base";
  const primaryBtn = "ui-btn-primary inline-flex min-h-11 items-center justify-center px-4 text-sm";
  const ghostBtn = "ui-btn-ghost inline-flex min-h-11 items-center justify-center px-3 text-sm";
  const iconBtn = "ui-btn-ghost inline-flex h-11 w-11 shrink-0 items-center justify-center px-0";
  const chip = (on: boolean) => `ui-chip text-sm ${on ? "ui-chip-on" : ""}`;
  const waitLabel = working ? workLabel || t("working") : t("opening_pdf");
  const waitOverlay = (busy || working) && (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 px-4"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={waitLabel}
    >
      <div className="w-full max-w-xs rounded-lg border border-border bg-surface px-5 py-4 text-center">
        <div className="ui-spin mx-auto h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="mt-3 text-sm font-medium text-text-primary">{waitLabel}</p>
        <p className="ui-small mt-1 text-text-secondary">{t("please_wait")}</p>
      </div>
    </div>
  );
  const focused = Boolean(bytes && job && job !== "master");
  const jobMeta = JOBS.find((j) => j.id === job);

  useEffect(() => {
    if (!bytes || !job || job === "master") return;
    if (job === "text") {
      setView("document");
      setPanel(null);
      return;
    }
    setView("page");
    if (job === "sign" || job === "hide" || job === "bw") {
      setPanel(null);
      return;
    }
    setPanel(job);
  }, [bytes, job]);

  if (!bytes) {
    const picked = JOBS.find((j) => j.id === job) ?? (job === "master" ? { title: "job_master", about: "job_master_help" } : null);
    return (
      <div className="flex min-h-dvh flex-col">
        <SiteHeader onHome={() => setJob(null)} />
        <main className="ui-wrap flex-1 py-8 sm:py-10">
          {!picked ? (
            <>
              <section className="max-w-2xl">
                <p className="ui-small font-semibold text-primary">{t("app_name")}</p>
                <h1 className="ui-hero mt-2 text-text-primary">
                  {t("hero_title")}
                  <span className="mt-1 block">{t("hero_line")}</span>
                </h1>
                <p className="ui-body mt-3 max-w-xl text-text-secondary">{t("hero_support")}</p>
                <button
                  type="button"
                  className="ui-btn-primary mt-5 min-h-11 w-full px-5 sm:w-auto"
                  onClick={() => document.getElementById("tools")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  {t("hero_cta")}
                </button>
              </section>
              <div id="privacy" className="mt-8 max-w-xl scroll-mt-20">
                <PrivacyTrust />
              </div>
              <h2 id="tools" className="ui-section mt-10 scroll-mt-20 text-text-primary">{t("nav_pdf_tools")}</h2>
              <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {JOBS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setJob(item.id)}
                    className="group ui-tool-card flex flex-col justify-between rounded-xl border border-border bg-surface p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div>
                      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${item.color} transition-transform duration-200 group-hover:scale-105`}>
                        <Icon name={item.icon} className="h-5 w-5" />
                      </div>
                      <h3 className="ui-card-title mt-3 font-semibold text-text-primary">
                        {t(item.title)}
                      </h3>
                      <p className="ui-small mt-1.5 leading-relaxed text-text-secondary">{t(item.about)}</p>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:underline" aria-hidden>
                      {t("hero_cta")}
                      <Icon name="next" className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </span>
                  </button>
                ))}
              </div>
              <section className="mt-8 rounded-lg border border-primary/20 bg-primary-soft p-5 sm:p-6 lg:flex lg:items-center lg:justify-between lg:gap-8">
                <div className="max-w-xl">
                  <h2 className="ui-section text-text-primary">{t("job_master")}</h2>
                  <p className="mt-1 text-base font-medium text-text-primary">{t("job_master_line")}</p>
                  <p className="ui-small mt-2 text-text-secondary">{t("job_master_help")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setJob("master")}
                  className="ui-btn-primary mt-4 min-h-11 w-full px-5 lg:mt-0 lg:w-auto"
                >
                  {t("job_master_cta")}
                </button>
              </section>
              <section id="about" className="mt-10 max-w-xl scroll-mt-20">
                <h2 className="ui-section text-text-primary">{t("nav_about")}</h2>
                <p className="ui-body mt-2 text-text-secondary">{t("footer_blurb")}</p>
              </section>
              <section id="faq" className="mt-10 max-w-2xl scroll-mt-20">
                <h2 className="ui-section text-text-primary">{t("faq_title")}</h2>
                <div className="mt-4 space-y-3">
                  <article className="rounded-lg border border-border bg-surface p-4">
                    <h3 className="text-sm font-semibold text-text-primary">{t("faq_q1")}</h3>
                    <p className="ui-small mt-1 text-text-secondary">{t("faq_a1")}</p>
                  </article>
                  <article className="rounded-lg border border-border bg-surface p-4">
                    <h3 className="text-sm font-semibold text-text-primary">{t("faq_q2")}</h3>
                    <p className="ui-small mt-1 text-text-secondary">{t("faq_a2")}</p>
                  </article>
                  <article className="rounded-lg border border-border bg-surface p-4">
                    <h3 className="text-sm font-semibold text-text-primary">{t("faq_q3")}</h3>
                    <p className="ui-small mt-1 text-text-secondary">{t("faq_a3")}</p>
                  </article>
                  <article className="rounded-lg border border-border bg-surface p-4">
                    <h3 className="text-sm font-semibold text-text-primary">{t("faq_q4")}</h3>
                    <p className="ui-small mt-1 text-text-secondary">{t("faq_a4")}</p>
                  </article>
                </div>
              </section>
            </>
          ) : (
            <ToolPageLayout
              current={job === "master" ? t("job_master") : t(picked.title)}
              title={t(job === "master" ? "page_master" : `page_${job}`)}
              description={t(job === "master" ? "job_master_help" : picked.about)}
              onHome={() => setJob(null)}
            >
              <UploadDropzone key={session} />
            </ToolPageLayout>
          )}
        </main>
        <SiteFooter onPick={(id) => setJob(id as JobId)} />
        {waitOverlay}
      </div>
    );
  }

  const docMeta = `${formatFileSize(bytes.byteLength)} · ${pageCount} ${t("pages_unit")}${
    compressCompare && compressCompare.after < compressCompare.before
      ? ` · ${formatFileSize(compressCompare.before)} → ${formatFileSize(compressCompare.after)}`
      : ""
  }`;

  return (
    <div className="flex h-dvh min-w-0 flex-col">
      <DocumentHeader
        name={name || "document.pdf"}
        meta={docMeta}
        privacy={<PrivacyTrust compact />}
        canUndo={pageHist.undoLen > 0}
        canRedo={pageHist.redoLen > 0}
        busy={busy || working}
        onUndo={() => void undoPage()}
        onRedo={() => void redoPage()}
        onDownload={downloadCurrent}
        onShowInfo={() => {
          setMoreOpen(false);
          setDocInfoOpen(true);
        }}
        undoTitle={`${t("undo")} ${modKey}+Z`}
        redoTitle={`${t("redo")} ${modKey}+Shift+Z`}
        more={
        <div>
          <button
            type="button"
            className={iconBtn}
            aria-label={t("more")}
            aria-expanded={moreOpen}
            title={t("more")}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              morePos.current = { top: rect.bottom + 4, right: Math.max(16, window.innerWidth - rect.right) };
              setMoreOpen((v) => !v);
            }}
          >
            <Icon name="more" />
          </button>
        </div>
        }
      />
      {moreOpen &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-slate-900/40 min-[768px]:bg-transparent"
              aria-label={t("cancel")}
              onClick={() => setMoreOpen(false)}
            />
            <div
              className="more-sheet ui-glass-dialog z-50 overflow-y-auto py-2 text-sm"
              style={
                isDesktop
                  ? { top: morePos.current.top, right: morePos.current.right }
                  : undefined
              }
            >
              <div className="mx-auto my-1 h-1 w-8 rounded-full bg-slate-300 min-[768px]:hidden" />
              <button type="button" className="ui-menu-item" onClick={() => { setDocInfoOpen(true); setMoreOpen(false); }}>
                {t("doc_info")}
              </button>
              <button type="button" className="ui-menu-item" onClick={() => { setThumbsOpen((v) => !v); setMoreOpen(false); }}>
                {t("thumbs")}
              </button>
              <button type="button" className="ui-menu-item" onClick={() => { setView(view === "page" ? "document" : "page"); setMoreOpen(false); }}>
                {view === "page" ? t("mode_document") : t("mode_page")}
              </button>
              <button type="button" className="ui-menu-item" onClick={() => { setPaletteOpen(true); setMoreOpen(false); }}>
                {t("cmd_title")}
              </button>
              <div className="my-1 border-t border-border/60 px-3 py-2">
                <LanguageSwitcher />
              </div>
              <button type="button" className="ui-menu-item border-t border-border/60 text-danger" onClick={hardClear}>
                {t("close_file")}
              </button>
            </div>
          </>,
          document.body
        )}
      {docInfoOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center min-[768px]:items-center" role="dialog" aria-modal="true" aria-labelledby="doc-info-title">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label={t("cancel")} onClick={() => setDocInfoOpen(false)} />
          <div className="relative max-h-[min(80dvh,32rem)] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface px-4 py-5 min-[390px]:px-5 min-[768px]:m-4 min-[768px]:rounded-xl">
            <h2 id="doc-info-title" className="text-base font-semibold text-text-primary">{t("doc_info")}</h2>
            <p className="mt-3 break-words text-[15px] font-medium leading-6 text-text-primary">{name || "document.pdf"}</p>
            <p className="mt-1 text-[13px] leading-5 text-text-muted">{docMeta}</p>
            <button type="button" className="ui-btn-secondary mt-4 min-h-11 w-full" onClick={() => setDocInfoOpen(false)}>
              {t("done")}
            </button>
          </div>
        </div>
      )}

      {overlays.length > 0 && (
        <div className="shrink-0 border-b border-border bg-surface px-3 py-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void applyEditsToPreview()}
            className={`${primaryBtn} min-h-11 w-full whitespace-normal sm:w-auto`}
          >
            {t("apply_to_preview")}
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {!focused && !railCollapsed && (
          <button
            type="button"
            className="absolute inset-0 z-20 bg-black/50 lg:hidden"
            aria-label={t("cancel")}
            onClick={() => setRailCollapsed(true)}
          />
        )}
        {!focused && (
        <div
          className={`relative z-30 h-full shrink-0 ${
            railCollapsed ? "w-12" : "w-12 lg:w-[4.25rem]"
          }`}
        >
          <ToolRail
            active={view === "document" ? "text" : tool}
            collapsed={railCollapsed}
            onToggleCollapse={() => setRailCollapsed((v) => !v)}
            onSelect={(id) => {
              onRail(id);
              if (window.matchMedia("(max-width: 1023px)").matches) setRailCollapsed(true);
            }}
            className={
              railCollapsed
                ? "h-full"
                : "absolute inset-y-0 left-0 shadow-lg lg:static lg:shadow-none"
            }
          />
        </div>
        )}
        {!focused && thumbsOpen && view === "page" && (
          <>
            <button
              type="button"
              className="absolute inset-0 z-10 bg-black/40 lg:hidden"
              aria-label={t("cancel")}
              onClick={() => setThumbsOpen(false)}
            />
            <div className="absolute inset-y-0 right-0 z-20 lg:static lg:z-auto">
              <PageThumbs pdf={pdf} page={page} pageCount={pageCount} onPage={setPage} />
            </div>
          </>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {job && (
            <div className="shrink-0 border-b border-border bg-background px-4 min-[390px]:px-5">
              <div className="mx-auto w-full max-w-[52rem]">
                <Breadcrumbs
                  current={job === "master" ? t("job_master") : t(jobMeta?.title || "app_name")}
                  onHome={hardClear}
                />
                {(job === "bw" || job === "hide" || job === "sign") && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    {job === "bw" && (
                      <button type="button" className={`${primaryBtn} min-h-11 w-full sm:w-auto`} disabled={busy || working || bwDone} onClick={runBw}>
                        {bwDone ? t("bw_done") : t("job_bw_btn")}
                      </button>
                    )}
                    {job === "hide" && (
                      <button type="button" className={`${primaryBtn} min-h-11 w-full sm:w-auto`} onClick={addCover}>
                        {t("job_hide_btn")}
                      </button>
                    )}
                    {job === "sign" && (
                      <button type="button" className={`${primaryBtn} min-h-11 w-full sm:w-auto`} onClick={() => setSignOpen(true)}>
                        {t("job_sign_btn")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {panel === "rotate" && (!focused || job === "rotate") && (
            <div className={panelBox}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium">{t("rotate_title")}</p>
                </div>
                <button type="button" className={ghostBtn} onClick={() => setPanel(null)} aria-label={t("cancel")}>
                  <Icon name="close" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={chip(rotateDir === 270)} onClick={() => setRotateDir(270)}>
                  {t("rotate_left")}
                </button>
                <button type="button" className={chip(rotateDir === 90)} onClick={() => setRotateDir(90)}>
                  {t("rotate_right")}
                </button>
              </div>
              <p className="mt-2 text-xs text-text-muted">{t("apply_to")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={chip(rotateScope === "page")} onClick={() => setRotateScope("page")}>
                  {t("current_page")}
                </button>
                <button type="button" className={chip(rotateScope === "all")} onClick={() => setRotateScope("all")}>
                  {t("all_pages")}
                </button>
                <button
                  type="button"
                  className={`${primaryBtn} w-full min-[480px]:ml-auto min-[480px]:w-auto`}
                  disabled={busy}
                  onClick={() =>
                    void apply(() =>
                      rotatePages(bytes, rotateDir, rotateScope === "page" ? [page - 1] : undefined)
                    )
                  }
                >
                  {t("apply")}
                </button>
              </div>
            </div>
          )}

          {panel === "compress" && (!focused || job === "compress") && (
            <div className={panelBox}>
              <p className="font-medium text-text-primary">{t("compress")}</p>
              <label className="mt-3 block text-sm text-text-secondary" htmlFor="compress-amount">
                {t("compress_slider")}
              </label>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[13px] leading-4 text-text-muted">
                <span className={compressAmount < 34 ? "font-medium text-text-primary" : undefined}>{t("compress_light")}</span>
                <span className={`text-center ${compressAmount >= 34 && compressAmount < 67 ? "font-medium text-text-primary" : ""}`}>{t("compress_balanced")}</span>
                <span className={`text-right ${compressAmount >= 67 ? "font-medium text-text-primary" : ""}`}>{t("compress_maximum")}</span>
              </div>
              <input
                id="compress-amount"
                type="range"
                min={0}
                max={100}
                step={1}
                value={compressAmount}
                onChange={(e) => setCompressAmount(Number(e.target.value))}
                className="compress-range"
                style={{ "--compress-pct": `${compressAmount}%` } as CSSProperties}
              />
              <p className="mt-2 text-[13px] leading-4 text-text-muted">{t("estimated")}</p>
              <p className="mt-0.5 text-sm font-medium text-text-primary">
                {formatFileSize(uploadSize ?? bytes.byteLength)}
                {" → "}
                {formatFileSize(
                  Math.max(1, Math.round((uploadSize ?? bytes.byteLength) * compressionTargetRatio(compressAmount)))
                )}
              </p>
              {compressCompare && (
                <p className={`mt-1 text-sm ${compressCompare.after < compressCompare.before ? "text-success" : "text-text-secondary"}`}>
                  {t("compress_compare", {
                    before: formatFileSize(compressCompare.before),
                    after: formatFileSize(compressCompare.after),
                  })}
                  {compressCompare.after < compressCompare.before
                    ? ` · ${Math.round((1 - compressCompare.after / compressCompare.before) * 100)}%`
                    : ""}
                </p>
              )}
              <div className="mt-4 flex flex-col gap-2 min-[480px]:flex-row">
              <button
                type="button"
                className={`${primaryBtn} w-full min-[480px]:w-auto`}
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    if (working) return;
                    const source = uploadBytesRef.current ?? bytes;
                    const before = source.byteLength;
                    snapshotPage();
                    setWorkLabel(t("compressing"));
                    setWorking(true);
                    try {
                      const out = await compressPdf(source, compressAmount);
                      const saved = out.byteLength < before ? out : source;
                      await setBytes(saved, name);
                      setCompressCompare({ before, after: saved.byteLength });
                      log(t("log_compressed", {
                        before: formatFileSize(before),
                        after: formatFileSize(out.byteLength),
                        pct: before ? Math.max(0, Math.round((1 - out.byteLength / before) * 100)) : 0,
                      }));
                    } catch {
                      pageHist.dropLast();
                      showToast("error", t("error"));
                    } finally {
                      setWorking(false);
                    }
                  })();
                }}
              >
                {t("compress_pdf")}
              </button>
              <button type="button" className={`${ghostBtn} w-full min-[480px]:w-auto`} onClick={() => setCompressAmount(50)}>
                {t("compress_reset")}
              </button>
              </div>
            </div>
          )}

          {panel === "protect" && (!focused || job === "protect") && (
              <form
              className={panelBox}
              onSubmit={(e) => {
                e.preventDefault();
                const password = lockPw;
                const length = [...password].length;
                if (length < 5) {
                  showToast("error", t("password_short"));
                  return;
                }
                if (length > 15) {
                  showToast("error", t("password_long"));
                  return;
                }
                if (password !== lockPw2) {
                  showToast("error", t("password_mismatch"));
                  return;
                }
                if (working || !bytes) return;
                setWorkLabel(t("protecting"));
                setWorking(true);
                void (async () => {
                  try {
                    const locked = await encryptPdf(bytes, password);
                    downloadBytes(locked, `${stem(name || "document")}-protected.pdf`);
                    setLockPw("");
                    setLockPw2("");
                    showToast("ok", t("protect_done"));
                    log(t("protect_done"));
                  } catch (err) {
                    const detail = err instanceof Error ? err.message : "";
                    showToast("error", detail || t("protect_failed"));
                  } finally {
                    setWorking(false);
                  }
                })();
              }}
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium">{t("lock_title")}</p>
                </div>
                <button type="button" className={ghostBtn} onClick={() => setPanel(null)} aria-label={t("cancel")}>
                  <Icon name="close" />
                </button>
              </div>
              <p className="mb-2 text-xs text-text-muted">{t("password_rule")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="password"
                  required
                  minLength={5}
                  maxLength={15}
                  autoComplete="new-password"
                  value={lockPw}
                  onChange={(e) => setLockPw(e.target.value)}
                  placeholder={t("set_password")}
                  aria-label={t("set_password")}
                  className={field}
                />
                <input
                  type="password"
                  required
                  minLength={5}
                  maxLength={15}
                  autoComplete="new-password"
                  value={lockPw2}
                  onChange={(e) => setLockPw2(e.target.value)}
                  placeholder={t("confirm_password")}
                  aria-label={t("confirm_password")}
                  className={field}
                />
              </div>
              <button type="submit" disabled={busy || working} className={`${primaryBtn} mt-2 min-h-11 w-full sm:w-auto`}>
                {t("protect_pdf")}
              </button>
            </form>
          )}

          {panel === "unlock" && (!focused || job === "unlock") && (
            <div className={panelBox}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-text-primary">{t("unlock_pdf")}</p>
                  <p className="ui-small mt-0.5 text-text-muted">{t("unlock_done")}</p>
                </div>
                <button
                  type="button"
                  onClick={downloadCurrent}
                  className={`${primaryBtn} shrink-0`}
                >
                  <Icon name="download" className="mr-1.5 h-4 w-4" />
                  {t("download")}
                </button>
              </div>
            </div>
          )}

          {panel === "pages" && (!focused || job === "pages") && (
            <div className={panelBox}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium">{t("tool_pages")}</p>
                </div>
                <button type="button" className={ghostBtn} onClick={() => setPanel(null)} aria-label={t("cancel")}>
                  <Icon name="close" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} className={ghostBtn} onClick={() => void apply(() => extractPages(bytes, [page - 1]))}>
                  {t("keep_page")}
                </button>
                <button
                  type="button"
                  disabled={busy || pageCount < 2}
                  className={ghostBtn}
                  onClick={() => void apply(() => deletePages(bytes, [page - 1]))}
                >
                  {t("delete_page")}
                </button>
              </div>
            </div>
          )}

          {panel === "merge" && (!focused || job === "merge") && (
            <div className={panelBox}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium">{t("merge")}</p>
                </div>
                <button type="button" className={ghostBtn} onClick={() => setPanel(null)} aria-label={t("cancel")}>
                  <Icon name="close" />
                </button>
              </div>
              <p className="text-xs text-text-muted">{t("merge_pick")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className={`${ghostBtn} cursor-pointer border border-border`}>
                  {t("merge")}
                  <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void onMergeInput(e)} />
                </label>
                {extraMergeBytes.length > 0 && (
                  <button
                    type="button"
                    className={primaryBtn}
                    onClick={() => {
                      void apply(() => mergePdfs([bytes, ...extraMergeBytes]));
                      clearMerge();
                    }}
                  >
                    {t("merge")} ({extraMergeBytes.length + 1})
                  </button>
                )}
              </div>
            </div>
          )}

          {view === "document" ? (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <p className="mb-2 text-sm text-text-secondary">{t("doc_help")}</p>
              {!hasSelectableText && (
                <p className="mb-2 rounded-md bg-primary-soft px-3 py-2 text-sm text-warning">{t("doc_no_text")}</p>
              )}
              <DocumentEditor key={docKey} html={docHtml} onHtml={setDocHtml} />
              <button type="button" disabled={busy} className={`${primaryBtn} mt-3 min-h-11 w-full whitespace-normal sm:w-auto`} onClick={() => void apply(() => htmlToPdf(docHtml))}>
                {t("apply_to_preview")}
              </button>
            </div>
          ) : (
            <div
              ref={workspaceRef}
              className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-pdf-workspace"
            >
              {(busy || loading) && (
                <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-surface/90 px-2 py-1 text-xs text-text-secondary">
                  {busy ? t("working") : t("opening_pdf")}
                </div>
              )}
              <div className="flex min-h-full w-full justify-center p-4 min-[390px]:p-5 md:p-6">
                <div
                  style={
                    size.width
                      ? { width: size.width * zoom, height: size.height * zoom }
                      : undefined
                  }
                >
                  <div
                    style={
                      size.width
                        ? {
                            transform: `scale(${zoom})`,
                            transformOrigin: "top left",
                            width: size.width,
                            height: size.height,
                          }
                        : undefined
                    }
                  >
                    <PdfCanvas
                      pdf={pdf}
                      bytes={bytes}
                      page={page}
                      onRendered={onRendered}
                    >
                      {overlays
                        .filter((b) => b.pageIndex === page - 1)
                        .map((b) => (
                          <TextOverlay
                            key={b.id}
                            box={b}
                            active={activeId === b.id}
                            onActivate={() => setActiveId(b.id)}
                            onRemove={() => {
                              setOverlays((all) => all.filter((x) => x.id !== b.id));
                              setActiveId(null);
                            }}
                            onChange={(patch) =>
                              setOverlays((all) => all.map((x) => (x.id === b.id ? { ...x, ...patch } : x)))
                            }
                            onDone={() => setActiveId(null)}
                          />
                        ))}
                    </PdfCanvas>
                  </div>
                </div>
              </div>
            </div>
          )}

          <BottomBar
            page={page}
            pageCount={pageCount}
            zoom={zoom}
            busy={busy || working}
            onPage={setPage}
            onZoom={setZoom}
            onFitWidth={fitWidth}
            onFitPage={fitPage}
          />
        </div>
      </div>

      <CommandPalette open={paletteOpen} items={commands} onClose={() => setPaletteOpen(false)} />

      {signOpen && (
        <SignaturePad
          onClose={() => setSignOpen(false)}
          onApply={(src) => {
            snapshotPage();
            const probe = new Image();
            probe.onload = () => {
              const width = 220;
              const height = Math.max(40, Math.round((width * probe.height) / Math.max(1, probe.width)));
              const id = crypto.randomUUID();
              setOverlays((b) => [
                ...b,
                {
                  id,
                  kind: "sign",
                  pageIndex: page - 1,
                  x: 48,
                  y: 160,
                  width,
                  height,
                  html: "",
                  src,
                  fontSize: 12,
                  fontFamily: "helvetica",
                },
              ]);
              setActiveId(id);
            };
            probe.src = src;
          }}
        />
      )}
      {waitOverlay}
    </div>
  );
}
