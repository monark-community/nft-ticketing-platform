const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FetchOptions extends RequestInit {
    data?: unknown;
}

// The API's error text, plus the HTTP status so callers can tell e.g. 409 from 500
export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = 'ApiError';
    }
}

export async function apiClient<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { data, headers, ...customConfig } = options;
    // File uploads (e.g. freezing an event) send FormData: the browser sets the multipart
    // Content-Type with its boundary, so it must not be set to JSON here
    const isFormData = typeof FormData !== 'undefined' && customConfig.body instanceof FormData;

    const config: RequestInit = {
        ...customConfig,
        credentials: 'include',
        headers: {
            ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
            ...headers,
        },
    };

    if (data !== undefined) {
        config.body = JSON.stringify(data);
    }

    const response = await fetch(`${API_URL}${endpoint}`, config);

    if (response.status === 401) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:session-expired'));
        }
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(errorData.error || 'An error occurred while fetching data.', response.status);
    }

    // 204 No Content (e.g. deleting a ticket type) has no body to parse
    if (response.status === 204) {
        return undefined as T;
    }

    return response.json();
}
