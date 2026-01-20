import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TwitchOAuthService } from '../services/TwitchOAuthService';

interface OAuthCallbackProps {
  oauthService: TwitchOAuthService;
}

export function OAuthCallback({ oauthService }: OAuthCallbackProps) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      // Check for access token in URL hash (implicit flow)
      const token = oauthService.parseTokenFromUrl(window.location.href);

      if (token) {
        oauthService.saveToken(token);
        navigate('/');
      } else {
        setError('No access token received');
        setTimeout(() => navigate('/'), 3000);
      }
    };

    processCallback();
  }, [oauthService, navigate]);

  return (
    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
      <h2>Authenticating...</h2>
      {error ? (
        <p style={{ color: 'red' }}>{error}</p>
      ) : (
        <p>Please wait while we complete the authentication process.</p>
      )}
    </div>
  );
}
