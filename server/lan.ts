// Afviser forespørgsler fra offentlige IP-adresser. Et ekstra lag oven på firewall —
// dashboardet må kun være tilgængeligt på kontorets lokale netværk.

export function erPrivatIp(ip: string): boolean {
  let a = ip.trim().toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7); // IPv4-mappet IPv6
  if (a === '::1' || a === 'localhost') return true;

  const v4 = a.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [o1, o2] = [Number(v4[1]), Number(v4[2])];
    return (
      o1 === 10 ||
      o1 === 127 ||
      (o1 === 172 && o2 >= 16 && o2 <= 31) ||
      (o1 === 192 && o2 === 168) ||
      (o1 === 169 && o2 === 254) // link-local
    );
  }
  // IPv6: unique local (fc00::/7) og link-local (fe80::/10)
  return /^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a);
}
