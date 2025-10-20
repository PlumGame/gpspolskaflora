// src/services/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase env vars: REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * loadTrackers
 * - возвращает массив трекеров из таблицы "trackers"
 * - опционально принимает фильтр и порядок
 */
export async function loadTrackers({ limit = 1000, orderBy = "id", order = "asc", filter = null } = {}) {
  let query = supabase.from("trackers").select("*").limit(limit).order(orderBy, { ascending: order === "asc" });

  if (filter && typeof filter === "object") {
    // пример: { active: true } или { user_id: "abc" }
    Object.entries(filter).forEach(([k, v]) => {
      query = query.eq(k, v);
    });
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * saveTrackersArray
 * - принимает массив объектов трекеров и выполняет upsert (insert или update по primary key)
 * - ожидает, что каждый объект содержит поле id либо другой ключ, который указан в uniqueConstraint
 * - возвращает { data, error }
 */
export async function saveTrackersArray(trackersArray = [], { returning = "minimal", onConflict = "id" } = {}) {
  if (!Array.isArray(trackersArray)) {
    throw new Error("saveTrackersArray expects an array");
  }
  if (trackersArray.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from("trackers")
    .upsert(trackersArray, { returning, onConflict });

  return { data, error };
}

/**
 * Дополнительные примеры экспорта при необходимости:
 * export async function deleteTracker(id) { ... }
 * export async function addTracker(obj) { ... }
 */

export default supabase;
