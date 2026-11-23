"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
} from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  StyleSpecification,
} from "maplibre-gl";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

// Default center when no pin is set yet: [longitude, latitude] (Iloilo City / central Philippines)
const DEFAULT_CENTER_LNGLAT: [number, number] = [122.5621, 10.7202];
const DEFAULT_ZOOM_UNPINNED = 12.5;
const DEFAULT_ZOOM_PINNED = 16.5;
const MIN_PHILIPPINES_ZOOM = 5.2;
const TILT_PITCH_DEGREES = 55;
const TILT_BEARING_DEGREES = -18;

// Bounding box covering the Philippine archipelago: [[westLng, southLat], [eastLng, northLat]]
const PHILIPPINES_BOUNDS = {
  minLng: 116.0,
  minLat: 4.4,
  maxLng: 127.0,
  maxLat: 21.3,
} as const;

const PHILIPPINES_MAX_BOUNDS: [[number, number], [number, number]] = [
  [PHILIPPINES_BOUNDS.minLng, PHILIPPINES_BOUNDS.minLat],
  [PHILIPPINES_BOUNDS.maxLng, PHILIPPINES_BOUNDS.maxLat],
];

function isWithinPhilippinesBounds(
  latitude: number,
  longitude: number,
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= PHILIPPINES_BOUNDS.minLat &&
    latitude <= PHILIPPINES_BOUNDS.maxLat &&
    longitude >= PHILIPPINES_BOUNDS.minLng &&
    longitude <= PHILIPPINES_BOUNDS.maxLng
  );
}

function clampToPhilippinesBounds(
  latitude: number,
  longitude: number,
): { latitude: number; longitude: number } {
  return {
    latitude: Number(
      Math.min(
        PHILIPPINES_BOUNDS.maxLat,
        Math.max(PHILIPPINES_BOUNDS.minLat, latitude),
      ).toFixed(6),
    ),
    longitude: Number(
      Math.min(
        PHILIPPINES_BOUNDS.maxLng,
        Math.max(PHILIPPINES_BOUNDS.minLng, longitude),
      ).toFixed(6),
    ),
  };
}

export type MapVisualMode = "street" | "satellite" | "hybrid";

function buildMapStyle(mode: MapVisualMode): StyleSpecification {
  if (mode === "street") {
    return {
      version: 8,
      sources: {
        esriWorldStreet: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: "Tiles &copy; Esri &mdash; OpenStreetMap contributors",
        },
      },
      layers: [
        {
          id: "esri-world-street-layer",
          type: "raster",
          source: "esriWorldStreet",
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    };
  }

  const sources: StyleSpecification["sources"] = {
    esriWorldImagery: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Tiles &copy; Esri",
    },
  };

  const layers: StyleSpecification["layers"] = [
    {
      id: "esri-world-imagery-layer",
      type: "raster",
      source: "esriWorldImagery",
      minzoom: 0,
      maxzoom: 22,
    },
  ];

  if (mode === "hybrid") {
    sources.esriTransportation = {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
    };
    sources.esriBoundariesPlaces = {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Labels &copy; Esri",
    };
    layers.push(
      {
        id: "esri-hybrid-transportation-layer",
        type: "raster",
        source: "esriTransportation",
        minzoom: 0,
        maxzoom: 22,
      },
      {
        id: "esri-hybrid-places-layer",
        type: "raster",
        source: "esriBoundariesPlaces",
        minzoom: 0,
        maxzoom: 22,
      },
    );
  }

  return {
    version: 8,
    sources,
    layers,
  };
}

function createPinMarkerElement(): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.width = "34px";
  wrapper.style.height = "42px";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";
  wrapper.style.cursor = "grab";
  wrapper.innerHTML = `
    <svg viewBox="0 0 32 40" width="34" height="42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 6px 10px rgba(34,34,34,0.38));">
      <path d="M16 1C7.716 1 1 7.716 1 16c0 10.65 13.15 21.55 14.08 22.3a1.45 1.45 0 0 0 1.84 0C17.85 37.55 31 26.65 31 16 31 7.716 24.284 1 16 1Z" fill="#e00b41" stroke="#ffffff" stroke-width="2.2"/>
      <circle cx="16" cy="15.5" r="5.5" fill="#ffffff"/>
    </svg>
  `;
  return wrapper;
}

export type AddressSuggestionItem = {
  id: string;
  primaryText: string;
  secondaryText: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
};

type PhotonFeature = {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    osm_id?: number | string;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    suburb?: string;
    city?: string;
    town?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
};

type NominatimResultItem = {
  place_id?: number | string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    village?: string;
    quarter?: string;
    city_district?: string;
    city?: string;
    town?: string;
    municipality?: string;
    state?: string;
    region?: string;
  };
};

function formatPhotonPropertiesToAddress(
  props: NonNullable<PhotonFeature["properties"]>,
  fallback: string,
): { primary: string; secondary: string; fullAddress: string } {
  const streetPart = [props.housenumber, props.street]
    .filter(Boolean)
    .join(" ");
  const primary =
    props.name?.trim() ||
    streetPart ||
    props.district ||
    props.suburb ||
    props.city ||
    fallback;
  const areaParts = [
    streetPart && streetPart !== primary ? streetPart : null,
    props.district ?? props.suburb ?? null,
    props.city ?? props.town ?? props.municipality ?? null,
    props.state ?? props.county ?? null,
  ].filter((part): part is string => Boolean(part && part.trim()));

  const deduplicatedParts: string[] = [];
  for (const part of [primary, ...areaParts]) {
    if (
      !deduplicatedParts.some(
        (existing) => existing.toLowerCase() === part.toLowerCase(),
      )
    ) {
      deduplicatedParts.push(part);
    }
  }

  return {
    primary,
    secondary: deduplicatedParts.slice(1).join(", "),
    fullAddress: deduplicatedParts.join(", "),
  };
}

async function fetchAddressSuggestions(
  query: string,
  signal: AbortSignal,
): Promise<AddressSuggestionItem[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // 1. Try Photon (fast OSM autocomplete strictly bounded to the Philippines)
  try {
    const bboxParam = `${PHILIPPINES_BOUNDS.minLng},${PHILIPPINES_BOUNDS.minLat},${PHILIPPINES_BOUNDS.maxLng},${PHILIPPINES_BOUNDS.maxLat}`;
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      trimmed,
    )}&lat=10.7202&lon=122.5621&bbox=${bboxParam}&limit=8&lang=en`;
    const response = await fetch(photonUrl, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        features?: PhotonFeature[];
      };
      const items: AddressSuggestionItem[] = [];
      const seen = new Set<string>();

      for (const feature of payload.features ?? []) {
        const coords = feature.geometry?.coordinates;
        const props = feature.properties;
        if (!coords || coords.length < 2 || !props) continue;
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!isWithinPhilippinesBounds(lat, lng)) continue;
        const countryCode = props.countrycode?.toUpperCase();
        const countryName = props.country?.toLowerCase();
        if (
          (countryCode && countryCode !== "PH") ||
          (countryName && countryName !== "philippines")
        ) {
          continue;
        }

        const { primary, secondary, fullAddress } =
          formatPhotonPropertiesToAddress(props, trimmed);
        const key = fullAddress.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        items.push({
          id: `${props.osm_id ?? items.length}-${lat.toFixed(5)}-${lng.toFixed(5)}`,
          primaryText: primary,
          secondaryText: secondary,
          fullAddress,
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6)),
        });
      }

      if (items.length > 0) {
        return items.slice(0, 5);
      }
    }
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      return [];
    }
  }

  // 2. Fallback to OpenStreetMap Nominatim search (strictly Philippines only)
  const viewbox = `${PHILIPPINES_BOUNDS.minLng},${PHILIPPINES_BOUNDS.maxLat},${PHILIPPINES_BOUNDS.maxLng},${PHILIPPINES_BOUNDS.minLat}`;
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=ph&viewbox=${viewbox}&bounded=1&limit=5&q=${encodeURIComponent(
    trimmed,
  )}`;
  const nomRes = await fetch(nominatimUrl, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!nomRes.ok) return [];
  const rows = (await nomRes.json()) as NominatimResultItem[];
  const suggestions: AddressSuggestionItem[] = [];

  for (const row of rows) {
    const lat = row.lat ? Number(row.lat) : Number.NaN;
    const lng = row.lon ? Number(row.lon) : Number.NaN;
    const display = row.display_name?.trim() ?? "";
    if (!display || !isWithinPhilippinesBounds(lat, lng)) continue;
    const segments = display
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const primaryText = row.name?.trim() || segments[0] || display;
    const secondaryText = segments.slice(1).join(", ");
    suggestions.push({
      id: `${row.place_id ?? suggestions.length}-${lat.toFixed(5)}`,
      primaryText,
      secondaryText,
      fullAddress: display,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
    });
  }

  return suggestions;
}

/**
 * Reverse-geocodes a pinned `(latitude, longitude)` into a human-readable
 * street/barangay/city address so dropping or dragging the map pin automatically
 * populates the `Property address` input field.
 */
async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<string | null> {
  // 1. Try OpenStreetMap Nominatim reverse geocoding
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      latitude.toFixed(6),
    )}&lon=${encodeURIComponent(longitude.toFixed(6))}&zoom=18&addressdetails=1`;
    const res = await fetch(nomUrl, {
      ...(signal ? { signal } : {}),
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as NominatimResultItem;
      const addr = data.address;
      if (addr) {
        const streetLine = [addr.house_number, addr.road]
          .filter(Boolean)
          .join(" ");
        const parts = [
          data.name && data.name !== addr.road ? data.name : null,
          streetLine || null,
          addr.neighbourhood ??
            addr.suburb ??
            addr.village ??
            addr.quarter ??
            addr.city_district ??
            null,
          addr.city ?? addr.town ?? addr.municipality ?? null,
          addr.state ?? addr.region ?? null,
        ].filter((p): p is string => Boolean(p && p.trim()));

        const deduped: string[] = [];
        for (const p of parts) {
          if (
            !deduped.some(
              (existing) => existing.toLowerCase() === p.toLowerCase(),
            )
          ) {
            deduped.push(p);
          }
        }
        if (deduped.length > 0) {
          return deduped.join(", ");
        }
      }
      if (data.display_name?.trim()) {
        return data.display_name.trim();
      }
    }
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      return null;
    }
  }

  // 2. Fallback to Photon reverse geocoding
  try {
    const photonUrl = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(
      latitude.toFixed(6),
    )}&lon=${encodeURIComponent(longitude.toFixed(6))}&lang=en`;
    const res = await fetch(photonUrl, {
      ...(signal ? { signal } : {}),
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const payload = (await res.json()) as { features?: PhotonFeature[] };
      const firstProps = payload.features?.[0]?.properties;
      if (firstProps) {
        const { fullAddress } = formatPhotonPropertiesToAddress(firstProps, "");
        if (fullAddress.trim()) {
          return fullAddress.trim();
        }
      }
    }
  } catch {
    // Ignore network errors
  }

  return null;
}

export type PropertyAddressAutocompleteInputProps = Omit<
  ComponentPropsWithoutRef<typeof Input>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (nextAddress: string) => void;
  onCoordinatesResolved?: (coords: {
    latitude: number;
    longitude: number;
    address?: string;
  }) => void;
};

/**
 * Single-line property address input linked two-way with the MapLibre map pin:
 * - Typing shows live autocomplete suggestions AND automatically moves the map
 *   pin to the best match as you type (or when you pick a suggestion).
 * - Dropping or dragging the pin on the map fills this input with the pinned
 *   street address via reverse geocoding.
 */
export function PropertyAddressAutocompleteInput({
  value,
  onValueChange,
  onCoordinatesResolved,
  disabled,
  onKeyDown,
  ...inputProps
}: PropertyAddressAutocompleteInputProps) {
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestionItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Tracks whether the most recent `value` change came from typing vs external pin reverse-geocoding
  const userTypedRef = useRef(false);
  const onCoordinatesResolvedRef = useRef(onCoordinatesResolved);

  useEffect(() => {
    onCoordinatesResolvedRef.current = onCoordinatesResolved;
  }, [onCoordinatesResolved]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!userTypedRef.current) {
      return;
    }

    const query = value.trim();
    if (query.length < 2 || disabled) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchAddressSuggestions(query, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(results);
          setActiveIndex(results.length > 0 ? 0 : -1);
          setOpen(results.length > 0);
          // Automatically link typed address -> map pin coordinates using top match
          const topMatch = results[0];
          if (topMatch && userTypedRef.current) {
            onCoordinatesResolvedRef.current?.({
              latitude: topMatch.latitude,
              longitude: topMatch.longitude,
            });
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, disabled]);

  function selectSuggestion(item: AddressSuggestionItem) {
    userTypedRef.current = false;
    onValueChange(item.fullAddress);
    onCoordinatesResolvedRef.current?.({
      address: item.fullAddress,
      latitude: item.latitude,
      longitude: item.longitude,
    });
    setOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (open && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(
          (prev) => (prev - 1 + suggestions.length) % suggestions.length,
        );
        return;
      }
      if (event.key === "Enter" && activeIndex >= 0) {
        const chosen = suggestions[activeIndex];
        if (chosen) {
          event.preventDefault();
          selectSuggestion(chosen);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(event);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        {...inputProps}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        value={value}
        onFocus={() => {
          if (suggestions.length > 0) {
            setOpen(true);
          }
        }}
        onChange={(event) => {
          const nextVal = event.target.value;
          userTypedRef.current = true;
          onValueChange(nextVal);
          if (nextVal.trim().length < 2) {
            setSuggestions([]);
            setOpen(false);
            setLoading(false);
          }
        }}
        onKeyDown={handleKeyDown}
      />

      {loading && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
          Locating…
        </span>
      )}

      {open && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute top-full right-0 left-0 z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-[0_12px_32px_-8px_rgb(34_34_34/0.22)]"
        >
          {suggestions.map((item, idx) => {
            const active = idx === activeIndex;
            return (
              <li
                key={item.id}
                role="option"
                aria-selected={active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectSuggestion(item);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors",
                  active
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground hover:bg-surface-muted",
                )}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                >
                  <path
                    fillRule="evenodd"
                    d="m9.69 18.933.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.273 1.765 11.842 11.842 0 0 0 .976.544l.062.029.018.008.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate font-semibold text-foreground">
                    {item.primaryText}
                  </span>
                  {item.secondaryText && (
                    <span className="truncate text-muted-foreground">
                      {item.secondaryText}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MapViewportToolbar({
  mode,
  tilted,
  onModeChange,
  onToggleTilt,
}: {
  mode: MapVisualMode;
  tilted: boolean;
  onModeChange: (nextMode: MapVisualMode) => void;
  onToggleTilt: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute top-2.5 left-2.5 z-10 flex flex-wrap items-center gap-1.5">
      <div
        role="group"
        aria-label="Map layer mode"
        className="inline-flex items-center rounded-lg border border-border bg-surface/95 p-0.5 text-xs shadow-sm backdrop-blur-sm"
      >
        {(
          [
            { key: "street", label: "Street" },
            { key: "satellite", label: "Satellite" },
            { key: "hybrid", label: "Hybrid" },
          ] as const
        ).map((option) => {
          const active = mode === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => onModeChange(option.key)}
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-surface-muted",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-pressed={tilted}
        onClick={onToggleTilt}
        className={cn(
          "cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors",
          tilted
            ? "bg-foreground text-surface"
            : "bg-surface/95 text-foreground hover:bg-surface-muted",
        )}
      >
        {tilted ? "3D Tilt On" : "3D Tilt"}
      </button>
    </div>
  );
}

export type PropertyMapPinPickerProps = {
  latitude: number | null;
  longitude: number | null;
  addressQuery?: string;
  disabled?: boolean;
  onChange: (next: {
    latitude: number | null;
    longitude: number | null;
    resolvedAddress?: string;
  }) => void;
};

/**
 * Interactive MapLibre GL map pin picker for `/settings/profile`.
 * Clicking the map, dragging the pin, or tapping "Use my location" automatically
 * reverse-geocodes the pinned point and fills the `Property address` field.
 */
export function PropertyMapPinPicker({
  latitude,
  longitude,
  addressQuery = "",
  disabled = false,
  onChange,
}: PropertyMapPinPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [visualMode, setVisualMode] = useState<MapVisualMode>("street");
  const [tilted, setTilted] = useState(false);

  const hasPin =
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  async function applyPinAndReverseGeocode(lat: number, lng: number) {
    const clamped = clampToPhilippinesBounds(lat, lng);
    const roundedLat = clamped.latitude;
    const roundedLng = clamped.longitude;

    // Immediately update the pin coordinates
    onChangeRef.current({
      latitude: roundedLat,
      longitude: roundedLng,
    });

    // Reverse-geocode in background to populate Property address
    reverseAbortRef.current?.abort();
    const controller = new AbortController();
    reverseAbortRef.current = controller;
    setResolvingAddress(true);
    try {
      const address = await reverseGeocodeCoordinates(
        roundedLat,
        roundedLng,
        controller.signal,
      );
      if (!controller.signal.aborted && address) {
        onChangeRef.current({
          latitude: roundedLat,
          longitude: roundedLng,
          resolvedAddress: address,
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setResolvingAddress(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    async function initMap() {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current || mapRef.current) return;
      maplibreRef.current = maplibregl;

      const rawLat =
        latitude !== null && Number.isFinite(latitude)
          ? latitude
          : DEFAULT_CENTER_LNGLAT[1];
      const rawLng =
        longitude !== null && Number.isFinite(longitude)
          ? longitude
          : DEFAULT_CENTER_LNGLAT[0];
      const initialClamped = clampToPhilippinesBounds(rawLat, rawLng);
      const initialLat = initialClamped.latitude;
      const initialLng = initialClamped.longitude;
      const initialZoom =
        latitude !== null && longitude !== null
          ? DEFAULT_ZOOM_PINNED
          : DEFAULT_ZOOM_UNPINNED;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: buildMapStyle("street"),
        center: [initialLng, initialLat],
        zoom: initialZoom,
        minZoom: MIN_PHILIPPINES_ZOOM,
        maxBounds: PHILIPPINES_MAX_BOUNDS,
        renderWorldCopies: false,
        pitch: 0,
        bearing: 0,
        maxPitch: 75,
        scrollZoom: true,
        dragRotate: true,
        pitchWithRotate: true,
        touchZoomRotate: true,
        touchPitch: true,
      });
      mapRef.current = map;

      map.addControl(
        new maplibregl.NavigationControl({
          visualizePitch: true,
          showCompass: true,
          showZoom: true,
        }),
        "top-right",
      );
      map.addControl(new maplibregl.FullscreenControl(), "top-right");
      map.addControl(
        new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }),
        "bottom-left",
      );

      map.on("pitch", () => {
        setTilted(map.getPitch() > 15);
      });

      function placeOrMoveMarker(lat: number, lng: number) {
        const clamped = clampToPhilippinesBounds(lat, lng);
        const roundedLat = clamped.latitude;
        const roundedLng = clamped.longitude;
        if (markerRef.current) {
          markerRef.current.setLngLat([roundedLng, roundedLat]);
        } else {
          const marker = new maplibregl.Marker({
            element: createPinMarkerElement(),
            anchor: "bottom",
            draggable: !disabled,
          })
            .setLngLat([roundedLng, roundedLat])
            .addTo(map);

          marker.on("drag", () => {
            const pos = marker.getLngLat();
            if (!isWithinPhilippinesBounds(pos.lat, pos.lng)) {
              const bounded = clampToPhilippinesBounds(pos.lat, pos.lng);
              marker.setLngLat([bounded.longitude, bounded.latitude]);
            }
          });

          marker.on("dragend", () => {
            const pos = marker.getLngLat();
            const bounded = clampToPhilippinesBounds(pos.lat, pos.lng);
            marker.setLngLat([bounded.longitude, bounded.latitude]);
            void applyPinAndReverseGeocode(bounded.latitude, bounded.longitude);
          });
          markerRef.current = marker;
        }
      }

      if (latitude !== null && longitude !== null) {
        placeOrMoveMarker(latitude, longitude);
      }

      map.on("click", (event) => {
        if (disabled) return;
        const { lat, lng } = event.lngLat;
        placeOrMoveMarker(lat, lng);
        setMapNotice(null);
        void applyPinAndReverseGeocode(lat, lng);
      });
    }

    void initMap();

    return () => {
      cancelled = true;
      reverseAbortRef.current?.abort();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // Initialize map once on mount; external coordinate updates sync in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!map || !maplibregl) return;

    if (
      latitude !== null &&
      longitude !== null &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    ) {
      const bounded = clampToPhilippinesBounds(latitude, longitude);
      if (markerRef.current) {
        markerRef.current.setLngLat([bounded.longitude, bounded.latitude]);
      } else {
        const marker = new maplibregl.Marker({
          element: createPinMarkerElement(),
          anchor: "bottom",
          draggable: !disabled,
        })
          .setLngLat([bounded.longitude, bounded.latitude])
          .addTo(map);
        marker.on("drag", () => {
          const pos = marker.getLngLat();
          if (!isWithinPhilippinesBounds(pos.lat, pos.lng)) {
            const clampedPos = clampToPhilippinesBounds(pos.lat, pos.lng);
            marker.setLngLat([clampedPos.longitude, clampedPos.latitude]);
          }
        });
        marker.on("dragend", () => {
          const pos = marker.getLngLat();
          const clampedPos = clampToPhilippinesBounds(pos.lat, pos.lng);
          marker.setLngLat([clampedPos.longitude, clampedPos.latitude]);
          void applyPinAndReverseGeocode(
            clampedPos.latitude,
            clampedPos.longitude,
          );
        });
        markerRef.current = marker;
      }

      const currentCenter = map.getCenter();
      const distance =
        Math.abs(currentCenter.lat - bounded.latitude) +
        Math.abs(currentCenter.lng - bounded.longitude);
      if (distance > 0.0005) {
        map.flyTo({
          center: [bounded.longitude, bounded.latitude],
          zoom: Math.max(map.getZoom(), DEFAULT_ZOOM_PINNED),
          duration: 750,
        });
      }
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [latitude, longitude, disabled]);

  function handleModeChange(nextMode: MapVisualMode) {
    setVisualMode(nextMode);
    mapRef.current?.setStyle(buildMapStyle(nextMode));
  }

  function handleToggleTilt() {
    const map = mapRef.current;
    if (!map) return;
    const nextTilted = !tilted;
    setTilted(nextTilted);
    map.easeTo({
      pitch: nextTilted ? TILT_PITCH_DEGREES : 0,
      bearing: nextTilted ? TILT_BEARING_DEGREES : 0,
      duration: 550,
    });
  }

  async function handleFindAddressOnMap() {
    const query = addressQuery.trim();
    if (!query) {
      setMapNotice("Type your property address above first, or click the map.");
      return;
    }
    setMapNotice(null);
    setSearching(true);
    const controller = new AbortController();
    try {
      const results = await fetchAddressSuggestions(query, controller.signal);
      const first = results[0];
      if (!first) {
        setMapNotice(
          "Could not find that exact address. Click directly on the map to drop your pin.",
        );
        return;
      }
      onChange({
        latitude: first.latitude,
        longitude: first.longitude,
        resolvedAddress: first.fullAddress,
      });
      mapRef.current?.flyTo({
        center: [first.longitude, first.latitude],
        zoom: DEFAULT_ZOOM_PINNED,
        duration: 750,
      });
    } catch {
      setMapNotice(
        "Address lookup is unavailable right now. Click directly on the map to drop your pin.",
      );
    } finally {
      setSearching(false);
    }
  }

  function handleUseCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMapNotice("Location access is not supported in this browser.");
      return;
    }
    setMapNotice(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const roundedLat = Number(pos.coords.latitude.toFixed(6));
        const roundedLng = Number(pos.coords.longitude.toFixed(6));
        void applyPinAndReverseGeocode(roundedLat, roundedLng);
        mapRef.current?.flyTo({
          center: [roundedLng, roundedLat],
          zoom: DEFAULT_ZOOM_PINNED,
          duration: 750,
        });
      },
      () => {
        setLocating(false);
        setMapNotice(
          "Could not read your device location. Allow location access or click the map to drop your pin.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function handleClearPin() {
    setMapNotice(null);
    reverseAbortRef.current?.abort();
    setResolvingAddress(false);
    onChange({ latitude: null, longitude: null });
  }

  return (
    <div className="grid gap-2.5 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              Map pin for guest directions (optional)
            </span>
            <Badge tone={hasPin ? "success" : "neutral"}>
              {resolvingAddress
                ? "Updating address…"
                : hasPin
                  ? "Location pinned"
                  : "No pin set"}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            Click or drag the crimson pin to automatically fill your property
            address, or type your address above to move the pin.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={searching}
            disabled={disabled || searching || locating}
            onClick={() => void handleFindAddressOnMap()}
          >
            Find address on map
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={locating}
            disabled={disabled || locating || searching}
            onClick={handleUseCurrentLocation}
          >
            Use my location
          </Button>
          {hasPin && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-danger"
              disabled={disabled}
              onClick={handleClearPin}
            >
              Clear pin
            </Button>
          )}
        </div>
      </div>

      {mapNotice && (
        <Alert tone="warning" role="status">
          {mapNotice}
        </Alert>
      )}

      <div className="relative h-72 w-full overflow-hidden rounded-panel border border-border bg-surface-muted sm:h-80">
        <MapViewportToolbar
          mode={visualMode}
          tilted={tilted}
          onModeChange={handleModeChange}
          onToggleTilt={handleToggleTilt}
        />
        <div
          ref={containerRef}
          aria-label="Property location map pin picker"
          className="h-full w-full"
        />
      </div>
    </div>
  );
}

export type PropertyMapPreviewProps = {
  latitude: number;
  longitude: number;
  propertyName: string;
  propertyAddress?: string | null;
  className?: string;
};

/**
 * Interactive MapLibre GL map preview showing the property's pinned destination
 * on `/book` and `/book/[roomId]` with mouse scroll zoom, 3D tilt, and
 * Street / Satellite / Hybrid modes.
 */
export function PropertyMapPreview({
  latitude,
  longitude,
  propertyName,
  propertyAddress,
  className,
}: PropertyMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [visualMode, setVisualMode] = useState<MapVisualMode>("street");
  const [tilted, setTilted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    async function initPreview() {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const bounded = clampToPhilippinesBounds(latitude, longitude);
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: buildMapStyle(visualMode),
        center: [bounded.longitude, bounded.latitude],
        zoom: DEFAULT_ZOOM_PINNED,
        minZoom: MIN_PHILIPPINES_ZOOM,
        maxBounds: PHILIPPINES_MAX_BOUNDS,
        renderWorldCopies: false,
        pitch: 0,
        bearing: 0,
        maxPitch: 75,
        scrollZoom: true,
        dragRotate: true,
        pitchWithRotate: true,
        touchZoomRotate: true,
        touchPitch: true,
      });
      mapRef.current = map;

      map.addControl(
        new maplibregl.NavigationControl({
          visualizePitch: true,
          showCompass: true,
          showZoom: true,
        }),
        "top-right",
      );
      map.addControl(new maplibregl.FullscreenControl(), "top-right");

      map.on("pitch", () => {
        setTilted(map.getPitch() > 15);
      });

      const marker = new maplibregl.Marker({
        element: createPinMarkerElement(),
        anchor: "bottom",
      })
        .setLngLat([bounded.longitude, bounded.latitude])
        .addTo(map);

      if (propertyName || propertyAddress) {
        const popupDiv = document.createElement("div");
        popupDiv.style.fontSize = "12px";
        popupDiv.style.lineHeight = "1.4";
        popupDiv.style.color = "#222222";
        const strong = document.createElement("strong");
        strong.textContent = propertyName;
        popupDiv.appendChild(strong);
        if (propertyAddress) {
          const br = document.createElement("br");
          const span = document.createElement("span");
          span.textContent = propertyAddress;
          popupDiv.appendChild(br);
          popupDiv.appendChild(span);
        }
        const popup = new maplibregl.Popup({ offset: 36 }).setDOMContent(
          popupDiv,
        );
        marker.setPopup(popup);
      }
    }

    void initPreview();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // Re-init only when coordinates or property details change; mode changes use setStyle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, propertyName, propertyAddress]);

  function handleModeChange(nextMode: MapVisualMode) {
    setVisualMode(nextMode);
    mapRef.current?.setStyle(buildMapStyle(nextMode));
  }

  function handleToggleTilt() {
    const map = mapRef.current;
    if (!map) return;
    const nextTilted = !tilted;
    setTilted(nextTilted);
    map.easeTo({
      pitch: nextTilted ? TILT_PITCH_DEGREES : 0,
      bearing: nextTilted ? TILT_BEARING_DEGREES : 0,
      duration: 550,
    });
  }

  return (
    <div
      className={cn(
        "relative h-64 w-full overflow-hidden rounded-xl border border-border bg-surface-muted sm:h-72",
        className,
      )}
    >
      <MapViewportToolbar
        mode={visualMode}
        tilted={tilted}
        onModeChange={handleModeChange}
        onToggleTilt={handleToggleTilt}
      />
      <div
        ref={containerRef}
        aria-label={`Map showing ${propertyName}`}
        className="h-full w-full"
      />
    </div>
  );
}

/**
 * Grab brand ride-hailing button (`#00B14F` Grab green) with car + pin icon,
 * opening the Grab app pre-pinned to the property's coordinates.
 */
export function GrabBookingLinkButton({
  href,
  size = "md",
  className,
}: {
  href: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 font-semibold text-white shadow-xs transition-colors duration-(--duration-control) ease-(--ease-control) bg-[#00b14f] hover:bg-[#009944] active:bg-[#00823a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00b14f]",
        size === "sm" ? "rounded-lg px-3.5 text-xs" : "rounded-xl px-4 text-sm",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="size-4 shrink-0"
      >
        <path d="M5.6 3.5A2.2 2.2 0 0 0 3.52 5l-1.15 3.46A2.25 2.25 0 0 0 1.5 10.2v4.05c0 .69.56 1.25 1.25 1.25h.75v1a1.25 1.25 0 1 0 2.5 0v-1h8v1a1.25 1.25 0 1 0 2.5 0v-1h.75c.69 0 1.25-.56 1.25-1.25V10.2c0-.76-.38-1.44-.87-1.74L16.48 5A2.2 2.2 0 0 0 14.4 3.5H5.6Zm-.62 2.02a.75.75 0 0 1 .71-.52h8.62c.32 0 .61.21.71.52l.95 2.86H4.03l.95-2.86ZM5 12.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
      </svg>
      <span>Book Grab</span>
    </a>
  );
}
