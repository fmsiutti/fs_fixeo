const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ErrorHttp extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ErrorHttp(`Error ${response.status} al pedir ${path}`, response.status);
  }

  return (await response.json()) as T;
}
