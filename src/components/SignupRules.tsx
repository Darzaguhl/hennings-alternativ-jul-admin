import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Event, OppgaveSlot, Shift, Skill } from '../types'
import { Button, Card, ErrorText, Input, Label } from './ui'

type Draft = Record<
  'max_oppgaver_per_vakt' | 'max_consecutive_shifts' | 'x1_min_shifts' | 'x1_min_core_shifts' | 'x1_core_first' | 'x1_core_last',
  string
>

const toDraft = (e: Event): Draft => ({
  max_oppgaver_per_vakt: e.max_oppgaver_per_vakt?.toString() ?? '',
  max_consecutive_shifts: e.max_consecutive_shifts?.toString() ?? '',
  x1_min_shifts: String(e.x1_min_shifts),
  x1_min_core_shifts: String(e.x1_min_core_shifts),
  x1_core_first: String(e.x1_core_first),
  x1_core_last: String(e.x1_core_last),
})

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('no-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message || fallback : fallback)

// Everything that limits what a volunteer can sign up for, in one place: the
// adjustable numbers, the vakt conflicts (passed in), "hva som helst", and the
// fixed rules the system applies. Admins edit; everyone else reads.
export default function SignupRules({
  event,
  isAdmin,
  shifts,
  skills,
  children,
}: {
  event: Event
  isAdmin: boolean
  shifts: Shift[]
  skills: Skill[]
  /** The vakt conflicts section. */
  children: ReactNode
}) {
  const { refresh } = useEvents()
  const saved = toDraft(event)
  const savedKey = `${event.id}:${Object.values(saved).join('|')}`
  const [draft, setDraft] = useState(saved)
  const [draftFor, setDraftFor] = useState(savedKey)
  // Start over from what's stored when the event (or its rules) changes.
  if (draftFor !== savedKey) {
    setDraftFor(savedKey)
    setDraft(saved)
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [slots, setSlots] = useState<OppgaveSlot[] | null>(null)
  const [slotsVersion, setSlotsVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    api
      .oppgaveSlots({ event: event.id })
      .then((s) => !cancelled && setSlots(s))
      .catch(() => !cancelled && setSlots(null))
    return () => {
      cancelled = true
    }
  }, [event.id, slotsVersion, shifts])

  const changed = (Object.keys(saved) as (keyof Draft)[]).some((k) => draft[k] !== saved[k])

  const save = async () => {
    setError('')
    setInfo('')
    const optional = (v: string) => (v.trim() === '' ? null : Number(v))
    const required = ['x1_min_shifts', 'x1_min_core_shifts', 'x1_core_first', 'x1_core_last'] as const
    if (required.some((k) => draft[k].trim() === '')) return setError('Fyll ut alle feltene for vaktleder (X1).')
    const filled = (Object.keys(draft) as (keyof Draft)[]).filter((k) => draft[k].trim() !== '')
    if (filled.some((k) => !Number.isInteger(Number(draft[k])) || Number(draft[k]) < 0)) return setError('Bruk hele tall.')
    const atLeastOne = ['max_oppgaver_per_vakt', 'max_consecutive_shifts', 'x1_min_shifts'] as const
    if (atLeastOne.some((k) => draft[k].trim() !== '' && Number(draft[k]) < 1))
      return setError('Grensene og «Vakter totalt» må være minst 1. La en grense stå tom for å fjerne den.')
    if (Number(draft.x1_core_first) > Number(draft.x1_core_last))
      return setError('«Fra vakt nr.» kan ikke være høyere enn «Til vakt nr.».')
    setBusy(true)
    try {
      await api.updateEvent(event.id, {
        max_oppgaver_per_vakt: optional(draft.max_oppgaver_per_vakt),
        max_consecutive_shifts: optional(draft.max_consecutive_shifts),
        x1_min_shifts: Number(draft.x1_min_shifts),
        x1_min_core_shifts: Number(draft.x1_min_core_shifts),
        x1_core_first: Number(draft.x1_core_first),
        x1_core_last: Number(draft.x1_core_last),
      })
      await refresh()
      setInfo('Reglene er lagret.')
    } catch (err) {
      setError(errorText(err, 'Kunne ikke lagre reglene. Sjekk at tallene er gyldige.'))
    } finally {
      setBusy(false)
    }
  }

  const flexible = skills.filter((s) => s.is_flexible)
  const missing = (skill: Skill) => shifts.filter((sh) => !slots?.some((sl) => sl.shift === sh.id && sl.skill === skill.id))

  const addEverywhere = async (skill: Skill) => {
    const targets = missing(skill)
    if (!confirm(`Legge «${skill.name}» på ${targets.length} vakter (uten begrensning i antall plasser)?`)) return
    setBusy(true)
    setError('')
    setInfo('')
    let done = 0
    try {
      for (const shift of targets) {
        await api.createOppgaveSlot(shift.id, skill.id, null)
        done += 1
      }
      setInfo(`«${skill.name}» ble lagt på ${done} vakter.`)
    } catch (err) {
      setError(`${errorText(err, 'Kunne ikke legge til oppgaven.')} (${done} av ${targets.length} ble lagt til.)`)
    } finally {
      setBusy(false)
      setSlotsVersion((v) => v + 1)
    }
  }

  // The X1 demand can only be met if enough vakter carry a number in the range.
  const coreVakter = shifts.filter(
    (s) => s.vakt_number !== null && s.vakt_number >= event.x1_core_first && s.vakt_number <= event.x1_core_last,
  ).length

  const number = (key: keyof Draft, label: string, min: number, placeholder = '') => (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        min={min}
        aria-label={label}
        placeholder={placeholder}
        disabled={!isAdmin}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </div>
  )
  const heading = 'mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600'
  const summary = [
    event.max_oppgaver_per_vakt ? `maks ${event.max_oppgaver_per_vakt} oppgaver per vakt` : 'ingen oppgavegrense',
    event.max_consecutive_shifts ? `maks ${event.max_consecutive_shifts} vakter på rad` : 'ingen grense på vakter på rad',
    `X1: ${event.x1_min_shifts} vakter`,
  ].join(' · ')

  return (
    <Card className="mb-6">
      <details>
        <summary className="cursor-pointer">
          <span className="text-lg font-semibold text-green-900">Regler for påmelding</span>
          <span className="ml-3 text-sm text-ink-600">{summary}</span>
        </summary>

        <div className="mt-5 flex flex-col gap-7">
          <section>
            <h3 className={heading}>Grenser</h3>
            <div className="grid max-w-xl grid-cols-2 gap-3">
              {number('max_oppgaver_per_vakt', 'Maks oppgaver per vakt', 1, 'ingen grense')}
              {number('max_consecutive_shifts', 'Maks vakter på rad', 1, 'ingen grense')}
            </div>
            <p className="mt-1 text-xs text-ink-600">Tomt felt = ingen grense. Grensene gjelder hver frivillig.</p>

            <h3 className={`${heading} mt-5`}>Vaktleder (X1)</h3>
            <div className="grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
              {number('x1_min_shifts', 'Vakter totalt', 1)}
              {number('x1_min_core_shifts', 'Av dem minst', 0)}
              {number('x1_core_first', 'Fra vakt nr.', 0)}
              {number('x1_core_last', 'Til vakt nr.', 0)}
            </div>
            {event.x1_min_core_shifts > 0 && coreVakter < event.x1_min_core_shifts && (
              <p className="mt-2 text-sm text-red-600">
                Bare {coreVakter} vakter har vaktnummer {event.x1_core_first}–{event.x1_core_last}, så ingen kan oppfylle X1-kravet. Sett
                vaktnummer på vaktene, eller endre kravet.
              </p>
            )}
            {isAdmin && (
              <Button className="mt-3" disabled={busy || !changed} onClick={save}>
                Lagre regler
              </Button>
            )}
          </section>

          <section>{children}</section>

          <section>
            <h3 className={heading}>Hva som helst</h3>
            {!isAdmin ? (
              <p className="text-sm text-ink-600">Frivillige kan velge «Hva som helst» og får da en oppgave ved oppmøte.</p>
            ) : flexible.length === 0 ? (
              <p className="text-sm text-ink-600">
                Ingen oppgave er merket «Hva som helst». Merk en under <Link to="/oppgaver" className="underline">Oppgaver</Link>.
              </p>
            ) : (
              flexible.map((skill) => (
                <div key={skill.id} className="flex flex-wrap items-center gap-3 text-sm text-ink-900">
                  <span>
                    «{skill.name}»{slots && ` finnes på ${shifts.length - missing(skill).length} av ${shifts.length} vakter`}
                  </span>
                  {slots && missing(skill).length > 0 && (
                    <Button variant="secondary" disabled={busy} onClick={() => addEverywhere(skill)}>
                      Legg på alle vakter
                    </Button>
                  )}
                </div>
              ))
            )}
          </section>

          <section>
            <h3 className={heading}>Faste regler</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-900">
              <li>
                Påmelding er bare åpen i påmeldingsvinduet
                {when(event.signup_opens_at) && ` fra ${when(event.signup_opens_at)}`}
                {when(event.signup_closes_at) && ` til ${when(event.signup_closes_at)}`}
                {!event.signup_opens_at && !event.signup_closes_at && ' (ingen grenser satt)'}.{' '}
                {isAdmin && <Link to="/arrangement" className="underline">Endre i Arrangement</Link>}
              </li>
              <li>På samme vakt velger man enten bestemte oppgaver eller «Hva som helst». De som velger «Hva som helst» havner i poolen ved innsjekk.</li>
              <li>Samme oppgave på samme vakt kan bare velges én gang.</li>
              <li>
                En oppgave er full når antall interesserte når antall plasser, og kan da ikke velges. Plasser settes per oppgave under
                «Rediger» på vakten.
              </li>
              <li>Kapasitet og minimum på selve vakten er bare til oversikt; de stopper ingen påmelding.</li>
              <li>Vakter merket «Krever erfaring» spør om relevant erfaring ved påmelding.</li>
              <li>
                Ved innsjekk tildeles oppgaven automatisk når personen har nøyaktig én påmelding den dagen (ikke for vakter som krever
                erfaring, og ikke «Hva som helst»).
              </li>
              <li>En person må være sjekket inn den dagen for å få en oppgave, og får høyst én oppgave per dag.</li>
              <li>Vaktleder (X1) meldes én gang per arrangement. Kravet sjekkes ved påmelding, ikke på nytt hvis noen melder seg av.</li>
              <li>Påmelding på nettsiden krever navn, e-post, telefon, adresse og fødselsdato.</li>
            </ul>
          </section>
        </div>
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
          {info && <p className="text-sm text-green-800">{info}</p>}
        </div>
      </details>
    </Card>
  )
}
