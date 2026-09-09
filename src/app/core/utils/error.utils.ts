interface PostgrestLikeError {
	message?: string;
	code?: string;
	details?: string;
	hint?: string;
}

export function formatErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	if (error && typeof error === "object") {
		const candidate = error as PostgrestLikeError;
		if (candidate.code === "23505") {
			return "Un projet avec ce nom existe déjà dans votre organisation.";
		}
		if (candidate.message) {
			return candidate.message;
		}
	}

	return fallback;
}
