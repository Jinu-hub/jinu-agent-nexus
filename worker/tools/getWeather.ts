// ─────────────────────────────────────────────────────────────────────────
// Tool: getWeather — server-side, takes a city name
//
// PATTERN: SERVER-SIDE TOOL WITH AN EXTERNAL API CALL
// ─────────────────────────────────────────────────────────────────────────
// Server-side tools can call any HTTP API. This one uses Open-Meteo
// (free, no API key) to geocode a city name and fetch the current
// weather there.
//
// Real production tools usually want:
//   • Retries with backoff — wrap the fetch in `agent.retry(...)`
//     (the agents SDK provides this on `this.retry`)
//   • Caching — use `caches.default` or a KV namespace
//   • Error handling — return an `{ error: "..." }` shape so the LLM
//     can recover or apologise
//
// If you swap to a paid weather API, the key lives in `.dev.vars`
// during dev and is pushed with `wrangler secret put MY_KEY` for
// production. Read it via `env.MY_KEY` and pass `env` into this
// factory.
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";

type GeoResult = {
  results?: Array<{
    name: string;
    country: string;
    latitude: number;
    longitude: number;
  }>;
};

type WeatherResult = {
  current?: {
    temperature_2m: number;
    weather_code: number;
  };
};

export function createGetWeatherTool() {
  return tool({
    description:
      "Get the current temperature and conditions for a city. Returns Celsius. Use when the user asks about weather, temperature, or 'is it raining in X'.",
    inputSchema: z.object({
      city: z
        .string()
        .describe("City name, e.g. 'Seoul', 'Tokyo', 'San Francisco'."),
    }),
    execute: async ({ city }) => {
      // 1. Geocode the city name to lat/lng. Open-Meteo's geocoding
      //    endpoint is a separate origin from the forecast endpoint.
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      );
      const geo = (await geoRes.json()) as GeoResult;
      const place = geo.results?.[0];
      if (!place) {
        return { error: `City "${city}" not found.` };
      }

      // 2. Fetch the current weather at those coordinates.
      const wxRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code`,
      );
      const wx = (await wxRes.json()) as WeatherResult;

      return {
        city: place.name,
        country: place.country,
        temperature_c: wx.current?.temperature_2m ?? null,
        weather_code: wx.current?.weather_code ?? null,
      };
    },
  });
}
