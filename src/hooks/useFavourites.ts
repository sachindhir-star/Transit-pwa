import { useCallback, useEffect, useState } from "react";
import { DEFAULT_FAVOURITES, FAV_STORAGE_KEY } from "../data/favourites";
import type { Favourite } from "../types";

export function useFavourites() {
  const [favourites, setFavourites] = useState<Favourite[]>(() => {
    try {
      const raw = localStorage.getItem(FAV_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Favourite[];
    } catch {
      /* ignore */
    }
    return DEFAULT_FAVOURITES;
  });

  useEffect(() => {
    localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(favourites));
  }, [favourites]);

  const resetDefaults = useCallback(() => {
    setFavourites(DEFAULT_FAVOURITES);
  }, []);

  const remove = useCallback((id: string) => {
    setFavourites((f) => f.filter((x) => x.id !== id));
  }, []);

  const add = useCallback((fav: Favourite) => {
    setFavourites((f) => (f.some((x) => x.id === fav.id) ? f : [...f, fav]));
  }, []);

  return { favourites, add, remove, resetDefaults };
}
