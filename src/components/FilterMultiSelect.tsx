import { useState } from 'react'
import { Checkbox, CloseButton, Combobox, Group, InputBase, Text, useCombobox } from '@mantine/core'

interface Option {
  value: string
  label: string
}

interface Props {
  label: string
  /** Shown when nothing is selected, e.g. "All clients". */
  placeholder: string
  data: Option[]
  value: string[]
  onChange: (value: string[]) => void
}

/**
 * Single-line multi-select for filters: the field shows a short summary ("Acme +2"),
 * the dropdown has a search box and a checkbox list.
 */
export function FilterMultiSelect({ label, placeholder, data, value, onChange }: Props) {
  const [search, setSearch] = useState('')
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
      setSearch('')
    },
    onDropdownOpen: () => combobox.focusSearchInput(),
  })

  const selected = data.filter((o) => value.includes(o.value))
  const query = search.trim().toLowerCase()
  const visible = data.filter((o) => o.label.toLowerCase().includes(query))

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  const summary =
    selected.length === 0 ? (
      <Text span c="dimmed" size="sm">
        {placeholder}
      </Text>
    ) : (
      <Group gap={6} wrap="nowrap" style={{ overflow: 'hidden' }}>
        <Text span size="sm" truncate>
          {selected[0].label}
        </Text>
        {selected.length > 1 && (
          <Text span size="sm" c="dimmed" style={{ flexShrink: 0 }}>
            +{selected.length - 1}
          </Text>
        )}
      </Group>
    )

  return (
    <Combobox store={combobox} onOptionSubmit={toggle} withinPortal position="bottom-start" width={280}>
      <Combobox.Target>
        <InputBase
          label={label}
          component="button"
          type="button"
          pointer
          onClick={() => combobox.toggleDropdown()}
          rightSectionPointerEvents={value.length ? 'all' : 'none'}
          rightSection={
            value.length ? (
              <CloseButton
                size="sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange([])
                }}
                aria-label={`Clear ${label}`}
              />
            ) : (
              <Combobox.Chevron />
            )
          }
        >
          {summary}
        </InputBase>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Search value={search} onChange={(e) => setSearch(e.currentTarget.value)} placeholder={`Search ${label.toLowerCase()}`} />
        <Combobox.Options mah={280} style={{ overflowY: 'auto' }}>
          {visible.length === 0 ? (
            <Combobox.Empty>Nothing found</Combobox.Empty>
          ) : (
            visible.map((o) => (
              <Combobox.Option value={o.value} key={o.value} active={value.includes(o.value)}>
                <Group gap="sm" wrap="nowrap">
                  <Checkbox checked={value.includes(o.value)} onChange={() => {}} tabIndex={-1} size="xs" style={{ pointerEvents: 'none' }} aria-hidden />
                  <Text size="sm">{o.label}</Text>
                </Group>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}
