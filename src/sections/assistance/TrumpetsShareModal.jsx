import { useEffect, useState } from "react";
import { Copy, ExternalLink, MessageCircle, RefreshCw, Link2Off } from "lucide-react";
import { fill } from "@/i18n/strings";
import { getShareLink, createShareLink, revokeShareLink, shareUrl } from "@/lib/trumpetsApi";

// Trombetas › "Link para o grupo" (GA leader): one link per GA and year that the group opens without a PIN and sees
// the guest names, who invited each one and who came — never phones or e-mails. Create, copy, send on WhatsApp,
// replace (the old link stops working) or turn off.
export default function TrumpetsShareModal({ tt, year, ga, onClose }) {
  const [link, setLink] = useState(undefined); // undefined = loading, null = none
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(null); // null | "renew" | "revoke"

  useEffect(() => {
    let off = false;
    getShareLink(year, ga.id)
      .then((l) => !off && setLink(l))
      .catch((e) => { if (!off) { setLink(null); setError(tt.errors[e.message] || tt.errors.generic); } });
    return () => { off = true; };
  }, [year, ga.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(tt.errors[e.message] || tt.errors.generic); } finally { setBusy(false); setConfirm(null); }
  };
  const create = () => run(async () => { setLink(await createShareLink(year, ga.id)); setCopied(false); });
  const revoke = () => run(async () => { await revokeShareLink(year, ga.id); setLink(null); setCopied(false); });

  const url = link ? shareUrl(link.token) : "";
  const message = fill(tt.shareMessage, { year, ga: ga.name, url });
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError(tt.shareCopyFailed); }
  };

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tfs-title" style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 14 }}>
        <style>{`
          .tfs-actions{display:flex;gap:8px;flex-wrap:wrap}
          .tfs-actions .btn{display:flex;gap:6px;align-items:center;text-decoration:none}
          @media (max-width:768px){.tfs-actions .btn{min-height:44px;flex:1 1 140px;justify-content:center}}
        `}</style>
        <h3 id="tfs-title" style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, margin: 0 }}>{fill(tt.shareTitle, { ga: ga.name })}</h3>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>{tt.shareIntro}</p>

        {link === undefined ? (
          <div style={{ color: "var(--muted)" }}>{tt.loading}</div>
        ) : !link ? (
          <div className="tfs-actions">
            <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>{busy ? tt.shareCreating : tt.shareCreate}</button>
          </div>
        ) : (
          <>
            <input readOnly value={url} aria-label={tt.shareLinkLabel} onFocus={(e) => e.target.select()} style={{ width: "100%", fontSize: 14 }} />
            <div className="tfs-actions">
              <button type="button" className="btn btn-primary" onClick={copy}><Copy size={16} /> {copied ? tt.shareCopied : tt.shareCopy}</button>
              <a className="btn btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> {tt.shareWhatsApp}</a>
              <a className="btn btn-ghost" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> {tt.shareOpen}</a>
            </div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {confirm ? (
                <>
                  <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>{confirm === "renew" ? tt.shareRenewConfirm : tt.shareRevokeConfirm}</div>
                  <div className="tfs-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)} disabled={busy}>{tt.cancel}</button>
                    <button type="button" className="btn btn-danger" onClick={confirm === "renew" ? create : revoke} disabled={busy}>{confirm === "renew" ? tt.shareRenew : tt.shareRevoke}</button>
                  </div>
                </>
              ) : (
                <div className="tfs-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm("renew")}><RefreshCw size={14} /> {tt.shareRenew}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm("revoke")}><Link2Off size={14} /> {tt.shareRevoke}</button>
                </div>
              )}
            </div>
          </>
        )}

        {error && <div role="alert" style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{tt.importClose}</button>
        </div>
      </div>
    </div>
  );
}
