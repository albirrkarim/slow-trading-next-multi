"use client";

import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { useServerInsertedHTML } from "next/navigation";
import { useState, type ReactNode } from "react";

type EmotionRegistryProps = {
  children: ReactNode;
};

type InsertedStyle = {
  name: string;
  isGlobal: boolean;
};

export function EmotionRegistry({ children }: EmotionRegistryProps) {
  const [{ cache, flush }] = useState(() => {
    const emotionCache = createCache({ key: "css" });
    emotionCache.compat = true;

    const prevInsert = emotionCache.insert;
    let inserted: InsertedStyle[] = [];

    emotionCache.insert = (...args) => {
      const [selector, serialized] = args;

      if (emotionCache.inserted[serialized.name] === undefined) {
        inserted.push({
          name: serialized.name,
          isGlobal: !selector,
        });
      }

      return prevInsert(...args);
    };

    const flushInserted = () => {
      const prevInserted = inserted;
      inserted = [];
      return prevInserted;
    };

    return { cache: emotionCache, flush: flushInserted };
  });

  useServerInsertedHTML(() => {
    const inserted = flush();

    if (inserted.length === 0) {
      return null;
    }

    let styles = "";
    let dataEmotionAttribute = cache.key;
    const globals: ReactNode[] = [];

    for (const { name, isGlobal } of inserted) {
      const style = cache.inserted[name];

      if (typeof style !== "string") {
        continue;
      }

      if (isGlobal) {
        globals.push(
          <style
            key={name}
            data-emotion={`${cache.key}-global ${name}`}
            dangerouslySetInnerHTML={{ __html: style }}
          />,
        );
        continue;
      }

      styles += style;
      dataEmotionAttribute += ` ${name}`;
    }

    return (
      <>
        {globals}
        {styles ? (
          <style
            data-emotion={dataEmotionAttribute}
            dangerouslySetInnerHTML={{ __html: styles }}
          />
        ) : null}
      </>
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
