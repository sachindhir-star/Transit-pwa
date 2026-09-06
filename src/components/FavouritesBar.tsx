import { getPlace } from "../data/places";
import type { Favourite, Place } from "../types";

interface Props {
  favourites: Favourite[];
  onPick: (from: Place, to: Place) => void;
  onReset: () => void;
}

export function FavouritesBar({ favourites, onPick, onReset }: Props) {
  return (
    <section className="favs">
      <div className="favs-head">
        <h2>Favourites</h2>
        <button type="button" className="linkish" onClick={onReset}>
          Reset seeds
        </button>
      </div>
      <div className="favs-scroll">
        {favourites.map((f) => {
          const from = getPlace(f.fromId);
          const to = getPlace(f.toId);
          if (!from || !to) return null;
          return (
            <button
              key={f.id}
              type="button"
              className="fav-chip"
              onClick={() => onPick(from, to)}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
