import axios from "axios";
const BASE_URL = "https://www.whatsgps.com";

/**
 * Универсальная отправка POST с заданным телом и заголовком form/json
 * Возвращает ответ axios или бросает ошибку
 */
async function doPost(path, body, isJson = false) {
  const url = `${BASE_URL}${path}`;
  const headers = isJson
    ? { "Content-Type": "application/json;charset=UTF-8" }
    : { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" };

  const data = isJson ? JSON.stringify(body) : new URLSearchParams(body).toString();
  return axios.post(url, data, { headers });
}

/**
 * Пытаемся выполнить логин разными вариантами полей и форматов.
 * Возвращаем { token, userId, userName } при успешном входе.
 * Бросаем ошибку с диагностикой, если ни один вариант не прошел.
 */
export async function loginWhatsGPS(username, password) {
  if (!username || !password) {
    throw new Error("loginWhatsGPS: username или password пусты");
  }

  // Варианты имён поля для логина и пароля
  const userFields = ["name", "username", "userName", "phone", "account", "user"];
  const passFields = ["password", "pwd", "pass"];

  // Базовые поля, которые часто требуются API
  const base = { timeZoneSecond: "0", lang: "en" };

  // Пробуем сначала form-urlencoded, затем JSON
  const tryVariants = async (isJson) => {
    for (const uf of userFields) {
      for (const pf of passFields) {
        const payload = { ...base, [uf]: username, [pf]: password };
        try {
          console.debug(`[loginWhatsGPS] trying ${isJson ? "JSON" : "FORM"} payload:`, payload);
          const res = await doPost("/user/login.do", payload, isJson);
          console.debug("[loginWhatsGPS] response:", res.status, res.data);
          if (res && res.data && res.data.ret === 1 && res.data.data) {
            return res.data.data; // успешный вход
          }
          // если сервер вернул структуру с сообщением, логируем её для диагностики
          if (res && res.data) {
            console.debug("[loginWhatsGPS] server reply (not success):", JSON.stringify(res.data));
          }
        } catch (err) {
          // Логируем подробности ответа сервера если есть, но продолжаем пробовать другие варианты
          const resp = err && err.response ? err.response.data : err.message;
          console.debug("[loginWhatsGPS] request error:", resp);
        }
      }
    }
    return null;
  };

  // Сначала пробуем form-urlencoded
  let result = await tryVariants(false);
  if (result) return result;

  // Затем пробуем JSON
  result = await tryVariants(true);
  if (result) return result;

  // Если ничего не сработало, бросаем подробную ошибку
  throw new Error(
    "loginWhatsGPS: не получилось залогиниться. Сервер возвращает параметр пустой или другой формат. " +
      "Проверьте корректность логина/пароля, формат (form/json) и требования API."
  );
}

/**
 * Получение координат техники
 * Возвращает массив [{ carId, machineName, lat, lon, speed, ... }]
 */
export async function getVehicleStatus(token, userId) {
  if (!token || !userId) {
    throw new Error("getVehicleStatus: token или userId пусты");
  }

  try {
    const res = await axios.get(`${BASE_URL}/carStatus/getByUserId.do`, {
      params: {
        targetUserId: userId,
        mapType: 2,
      },
      headers: {
        token: token,
      },
    });

    if (!res.data || res.data.ret !== 1) {
      throw new Error("Ошибка получения данных: " + JSON.stringify(res.data));
    }

    return res.data.data;
  } catch (error) {
    console.error("Ошибка при загрузке координат:", error && error.response ? error.response.data : error.message);
    throw error;
  }
}
