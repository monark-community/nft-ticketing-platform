const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FetchOptions extends RequestInit {
    data?: unknown;
}

export async function apiClient<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { data, headers, ...customConfig } = options;

    const config: RequestInit = {
        ...customConfig,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
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
        throw new Error(errorData.error || 'An error occurred while fetching data.');
    }

    return response.json();
}