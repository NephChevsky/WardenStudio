import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TwitchOAuthService } from '../services/TwitchOAuthService';

interface OAuthCallbackProps {
  oauthService: TwitchOAuthService;
}

export function OAuthCallback({ oauthService }: OAuthCallbackProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const token = oauthService.parseTokenFromHash(hash);

    if (token) {
      oauthService.saveToken(token);
      navigate('/');
    } else {
      console.error('No token found in callback');
      navigate('/');
    }
  }, [oauthService, navigate]);

  return (
    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
      <h2>Authenticating...</h2>
      <p>Please wait while we complete the authentication process.</p>
    </div>
  );
}
