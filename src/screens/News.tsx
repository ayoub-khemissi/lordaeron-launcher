import { Button, Chip, Spinner, Tab, Tabs } from "@heroui/react";
import { ExternalLink, Megaphone, ScrollText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { useLauncher } from "../lib/store";
import type { NewsPost } from "../lib/types";

export type NewsTarget = { tab: "announcements" | "changelog"; id?: string };

export function formatDate(iso: string, language: string, withTime = false) {
  return new Intl.DateTimeFormat(language, withTime ? { dateStyle: "long", timeStyle: "short" } : { dateStyle: "long" }).format(
    new Date(iso),
  );
}

// Discord's posts, as Markdown: links open in the browser, headings and lists in the launcher's look
export function PostBody({ markdown }: { markdown: string }) {
  return (
    <div className="text-[14px] leading-relaxed text-white/80">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h2 className="mb-3 mt-1 font-heading text-2xl text-wow-gold-light">{children}</h2>,
          h2: ({ children }) => <h3 className="mb-2 mt-5 font-heading text-xl text-wow-gold-light">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-2 mt-4 text-[15px] font-semibold text-white/95">{children}</h4>,
          p: ({ children }) => <p className="my-2.5">{children}</p>,
          ul: ({ children }) => <ul className="my-2 space-y-1.5 pl-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1.5 pl-5">{children}</ol>,
          li: ({ children }) => (
            <li className="flex gap-2.5">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-wow-gold/80" />
              <span className="min-w-0">{children}</span>
            </li>
          ),
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          code: ({ children }) => <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12.5px] text-wow-gold-light">{children}</code>,
          blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-wow-gold/50 pl-4 text-white/65">{children}</blockquote>,
          a: ({ href, children }) => (
            <a
              className="text-wow-blue underline decoration-wow-blue/40 underline-offset-2 hover:decoration-wow-blue"
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href?.startsWith("https://")) api.open("url", href);
              }}
            >
              {children}
            </a>
          ),
        }}
        remarkPlugins={[remarkGfm]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export function RealmBadge({ realm }: { realm: string | null }) {
  if (!realm) return null;

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        realm === "rimeheart" ? "bg-wow-blue-ice/15 text-wow-blue-ice" : "bg-wow-gold/15 text-wow-gold-light"
      }`}
    >
      {realm}
    </span>
  );
}

export function NewsScreen({ target }: { target?: NewsTarget }) {
  const { t, language } = useI18n();
  const { news, loadNews, status } = useLauncher();
  const [tab, setTab] = useState<NewsTarget["tab"]>(target?.tab ?? "announcements");
  const [realmOnly, setRealmOnly] = useState(true);
  const [selected, setSelected] = useState<string | undefined>(target?.id);
  // older posts, ten at a time, as the list is scrolled to its end
  const [older, setOlder] = useState<Record<NewsTarget["tab"], NewsPost[]>>({ announcements: [], changelog: [] });
  const [pages, setPages] = useState<Record<NewsTarget["tab"], number>>({ announcements: 1, changelog: 1 });
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!news) loadNews();
  }, [news, loadNews]);

  const total = news?.pages?.[tab] ?? 1;
  const more = pages[tab] < total;
  const loadMore = useCallback(async () => {
    if (loadingMore || !more) return;
    setLoadingMore(true);
    try {
      const next = pages[tab] + 1;
      const { posts } = await api.newsPage(tab, next);

      setOlder((o) => ({ ...o, [tab]: [...o[tab], ...posts.filter((p) => !o[tab].some((q) => q.id === p.id))] }));
      setPages((p) => ({ ...p, [tab]: next }));
    } catch {
      setPages((p) => ({ ...p, [tab]: total })); // nothing more to read now
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, more, pages, tab, total]);

  useEffect(() => {
    const node = sentinel.current;

    if (!node) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), {
      rootMargin: "200px",
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, [loadMore]);

  const realm = status?.prefs.realm ?? null;
  const list: NewsPost[] = useMemo(() => {
    const first = news?.[tab] ?? [];
    const posts = [...first, ...older[tab].filter((p) => !first.some((q) => q.id === p.id))];

    return realmOnly ? posts.filter((p) => !p.realm || p.realm === realm) : posts;
  }, [news, tab, realmOnly, realm, older]);
  const post = list.find((p) => p.id === selected) ?? list[0];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-end gap-6 px-8 pb-2 pt-7">
        <div className="flex-1">
          <h1 className="font-heading text-3xl text-gold-gradient">{t("news.title")}</h1>
          <p className="mt-1 text-sm text-white/50">{t("news.subtitle")}</p>
        </div>
      </header>
      <div className="flex items-center gap-4 px-6">
        <Tabs
          aria-label={t("news.title")}
          classNames={{ cursor: "bg-wow-gold", tabContent: "group-data-[selected=true]:text-wow-gold-light" }}
          selectedKey={tab}
          variant="underlined"
          onSelectionChange={(k) => {
            setTab(k as NewsTarget["tab"]);
            setSelected(undefined);
          }}
        >
          <Tab key="announcements" title={<span className="flex items-center gap-2"><Megaphone size={15} />{t("news.announcements")}</span>} />
          <Tab key="changelog" title={<span className="flex items-center gap-2"><ScrollText size={15} />{t("news.changelog")}</span>} />
        </Tabs>
        <div className="ml-auto flex gap-1.5">
          <Chip
            className="cursor-pointer"
            color={realmOnly ? "warning" : "default"}
            size="sm"
            variant={realmOnly ? "flat" : "bordered"}
            onClick={() => setRealmOnly(true)}
          >
            {status?.feed?.realms.find((r) => r.id === realm)?.name ?? realm}
          </Chip>
          <Chip
            className="cursor-pointer"
            color={!realmOnly ? "warning" : "default"}
            size="sm"
            variant={!realmOnly ? "flat" : "bordered"}
            onClick={() => setRealmOnly(false)}
          >
            {t("news.allRealms")}
          </Chip>
        </div>
      </div>

      {!news ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner color="warning" />
        </div>
      ) : list.length === 0 ? (
        <p className="mt-16 text-center text-sm text-white/45">{t("news.empty")}</p>
      ) : (
        <div className="flex min-h-0 flex-1 border-t border-white/5">
          <aside className="thin-scroll w-72 shrink-0 overflow-y-auto border-r border-white/5 p-3">
            {list.map((p) => (
              <button
                key={p.id}
                className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left transition ${
                  p.id === post?.id ? "bg-wow-gold/12" : "hover:bg-white/5"
                }`}
                onClick={() => setSelected(p.id)}
              >
                <div className="flex items-center gap-2 text-[11px] text-white/45">
                  {formatDate(p.date, language)}
                  <RealmBadge realm={p.realm} />
                </div>
                <p className={`mt-0.5 line-clamp-2 text-[13px] ${p.id === post?.id ? "text-wow-gold-light" : "text-white/85"}`}>
                  {p.title || t("news.untitled")}
                </p>
              </button>
            ))}
            <div ref={sentinel} className="flex justify-center py-3">
              {loadingMore ? (
                <Spinner color="warning" size="sm" />
              ) : more ? (
                <Button size="sm" variant="light" onPress={loadMore}>
                  {t("news.more")}
                </Button>
              ) : null}
            </div>
          </aside>
          {post && (
            <article key={post.id} className="thin-scroll min-w-0 flex-1 overflow-y-auto px-8 pb-10 pt-5">
              <div className="mb-3 flex items-center gap-3 text-xs text-white/45">
                {formatDate(post.date, language, true)}
                <RealmBadge realm={post.realm} />
                <Button
                  className="ml-auto"
                  size="sm"
                  startContent={<ExternalLink size={13} />}
                  variant="flat"
                  onPress={() => api.open("url", post.url)}
                >
                  {t("news.onDiscord")}
                </Button>
              </div>
              {post.images[0] && (
                <img
                  alt=""
                  className="mb-5 w-full rounded-2xl border border-white/10 object-cover"
                  src={post.images[0].url}
                  style={{ aspectRatio: `${post.images[0].width} / ${post.images[0].height}`, maxHeight: 360 }}
                />
              )}
              <PostBody markdown={post.markdown} />
              {post.images.length > 1 && (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {post.images.slice(1).map((img) => (
                    <img key={img.url} alt="" className="w-full rounded-xl border border-white/10" src={img.url} />
                  ))}
                </div>
              )}
              <p className="mt-8 text-[11px] text-white/30">{t("news.fromDiscord")}</p>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
