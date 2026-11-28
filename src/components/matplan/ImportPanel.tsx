import { useState } from 'react'
import { api, ApiError } from '../../api/client'
import type { CrmImportReport } from '../../types'
import { Button, ErrorText, FileInput } from '../ui'

export default function ImportPanel({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<CrmImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (dryRun: boolean) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const result = await api.crmImport(file, dryRun)
      setReport(result)
      if (!dryRun) onImported()
    } catch (err) {
      // A rejected file comes back as an ApiError with the reason. Anything
      // else means no answer arrived at all (network, or the server gave up
      // waiting) -- say so rather than a vague "failed".
      setError(
        err instanceof ApiError
          ? err.message || 'Kunne ikke importere filen.'
          : 'Fikk ikke svar fra serveren. Importen kan ha tatt for lang tid. Last siden på nytt og se om noe ble importert, eller prøv igjen.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-ink-600">
        Leser arkene «Matvarer» og «Kontakt &amp; Levering» fra årets arbeidsbok: givere, kontaktpersoner og linjene for forrige år, i år og
        neste år. Forhåndsvis først, så ser du hvordan leverandørnavn kobles til givere. Importen kan kjøres flere ganger: den fyller bare ut
        tomme felt og overskriver ikke det du har endret.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <FileInput
          accept=".xlsx"
          fileName={file?.name}
          chooseLabel="Velg Excel-fil"
          changeLabel="Bytt fil"
          onChange={(f) => {
            setFile(f)
            setReport(null)
            setError('')
          }}
        />
        {file && <span className="text-sm text-ink-600">{file.name}</span>}
        <Button variant="secondary" disabled={!file || busy} onClick={() => run(true)}>
          Forhåndsvis
        </Button>
        <Button disabled={!file || busy} onClick={() => run(false)}>
          Importer
        </Button>
      </div>
      {busy && <p className="mt-2 text-sm text-ink-600">Leser filen …</p>}
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
      {report && (
        <div className="mt-4 text-sm text-ink-900">
          <p className="font-medium">
            {report.dry_run ? 'Forhåndsvisning (ingenting er lagret)' : 'Importert'}
            {report.years.current && ` · ${report.years.previous}–${report.years.next}`}
          </p>
          <p className="text-ink-600">
            Givere: {report.donors.created} nye · Kontakter: {report.contacts.created} nye · Varer: {report.items.created} nye · Linjer:{' '}
            {report.lines.created} nye, {report.lines.updated} utfylt
          </p>
          {report.supplier_resolution.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-ink-600">Slik ble leverandørnavn koblet ({report.supplier_resolution.length})</summary>
              <ul className="mt-1 list-disc pl-5 text-ink-600">
                {report.supplier_resolution.map((d) => (
                  <li key={d.text}>
                    «{d.text}» → {d.donor}
                    {d.via && ` via ${d.via}`} <span className="text-xs">({d.how})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {report.unparsed_quantities.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-gold-600">Mengder jeg ikke kunne lese ({report.unparsed_quantities.length})</summary>
              <ul className="mt-1 list-disc pl-5 text-ink-600">
                {report.unparsed_quantities.map((u, i) => (
                  <li key={i}>
                    {u.item}: «{u.text}»
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
