interface AuthorizationResult {
  authorized: boolean;
  loading: boolean;
  error: string | null;
}

export const useAuthorization = (_functionName: string): AuthorizationResult => ({
  authorized: true,
  loading: false,
  error: null,
});

export const checkAuthorization = async (_functionName: string): Promise<boolean> => true;
