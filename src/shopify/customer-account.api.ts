import { createHash, randomBytes } from "node:crypto";

const CUSTOMER_QUERY = `
  query FcCustomerProfile {
    customer {
      id
      firstName
      lastName
      emailAddress {
        emailAddress
      }
    }
  }
`;

export interface OpenIdConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  jwks_uri?: string;
  issuer?: string;
}

export interface CustomerAccountApiConfig {
  graphql_api: string;
  mcp_api?: string;
}

export interface CustomerAccessTokenResponse {
  access_token: string;
  expires_in: number;
  id_token?: string;
  refresh_token?: string;
}

export interface ShopifyCustomerProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

export function generateCodeChallenge(codeVerifier: string): string {
  return base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
}

export function generateOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function generateOAuthNonce(): string {
  return randomBytes(16).toString("hex");
}

export async function discoverOpenIdConfiguration(
  shopDomain: string,
): Promise<OpenIdConfiguration> {
  const res = await fetch(`https://${shopDomain}/.well-known/openid-configuration`);
  if (!res.ok) {
    throw new Error(
      `Shopify OpenID discovery failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as OpenIdConfiguration;
}

export async function discoverCustomerAccountApi(
  shopDomain: string,
): Promise<CustomerAccountApiConfig> {
  const res = await fetch(`https://${shopDomain}/.well-known/customer-account-api`);
  if (!res.ok) {
    throw new Error(
      `Shopify Customer Account API discovery failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as CustomerAccountApiConfig;
}

export function buildCustomerAuthorizationUrl(input: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    scope: "openid email customer-account-api:full",
    client_id: input.clientId,
    response_type: "code",
    redirect_uri: input.redirectUri,
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${input.authorizationEndpoint}?${params.toString()}`;
}

export async function exchangeCustomerAuthorizationCode(input: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  origin: string;
}): Promise<CustomerAccessTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code: input.code,
    code_verifier: input.codeVerifier,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: input.origin,
    "User-Agent": "FC-Customer-OAuth/1.0",
  };
  if (input.clientSecret) {
    const credentials = Buffer.from(`${input.clientId}:${input.clientSecret}`).toString(
      "base64",
    );
    headers.Authorization = `Basic ${credentials}`;
  }

  const res = await fetch(input.tokenEndpoint, {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok) {
    throw new Error(
      `Shopify customer token exchange failed: ${res.status} ${await res.text()}`,
    );
  }

  const json = (await res.json()) as CustomerAccessTokenResponse;
  if (!json.access_token) {
    throw new Error("Shopify customer token exchange returned no access_token");
  }
  return json;
}

export async function fetchShopifyCustomerProfile(
  graphqlEndpoint: string,
  accessToken: string,
  origin: string,
): Promise<ShopifyCustomerProfile> {
  const res = await fetch(graphqlEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: accessToken,
      Origin: origin,
      "User-Agent": "FC-Customer-OAuth/1.0",
    },
    body: JSON.stringify({
      operationName: "FcCustomerProfile",
      query: CUSTOMER_QUERY,
      variables: {},
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Shopify customer profile query failed: ${res.status} ${await res.text()}`,
    );
  }

  const json = (await res.json()) as {
    data?: {
      customer?: {
        id?: string;
        firstName?: string | null;
        lastName?: string | null;
        emailAddress?: { emailAddress?: string | null } | null;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).filter(Boolean).join("; "));
  }

  const customer = json.data?.customer;
  if (!customer?.id) {
    throw new Error("Shopify customer profile query returned no customer");
  }

  return {
    id: customer.id,
    firstName: customer.firstName ?? null,
    lastName: customer.lastName ?? null,
    email: customer.emailAddress?.emailAddress ?? null,
  };
}
