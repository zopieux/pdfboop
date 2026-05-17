import { styled } from '@macaron-css/solid';
import { type Component, For, onCleanup, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  CHANGELOG_CONTENT,
  ChangelogHtmlContainer,
  CURRENT_VERSION,
  parseChangelog,
} from '../changelog';
import { bookmarkVersion } from '../state';
import { themeClass, vars } from '../theme';
import { Button } from './ui/Button';

const ModalBackdrop = styled('div', {
  base: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: vars.gaps.lg,
  },
});

const ModalContent = styled('div', {
  base: {
    background: vars.colors.surface,
    borderRadius: '12px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '85vh',
    width: '100%',
    maxWidth: '560px',
    overflow: 'hidden',
    position: 'relative',
    color: vars.colors.text,
    border: `1px solid ${vars.colors.border}`,
  },
});

const ModalHeader = styled('div', {
  base: {
    padding: '16px 20px',
    background: vars.colors.bg,
    borderBottom: `1px solid ${vars.colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
});

const ModalTitle = styled('div', {
  base: {
    fontWeight: 600,
    fontSize: '16px',
    color: vars.colors.text,
  },
});

const ModalBody = styled('div', {
  base: {
    flex: 1,
    padding: '24px 20px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
});

const ModalFooter = styled('div', {
  base: {
    padding: '12px 20px',
    borderTop: `1px solid ${vars.colors.border}`,
    display: 'flex',
    justifyContent: 'flex-end',
    background: vars.colors.bg,
  },
});

const VersionBlock = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    selectors: {
      '&:not(:first-of-type)': {
        marginTop: '24px',
      },
    },
  },
});

const VersionHeader = styled('h2', {
  base: {
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
    color: vars.colors.primary,
    borderBottom: `1px solid ${vars.colors.border}`,
    paddingBottom: vars.gaps.xs,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
});

const VersionDate = styled('span', {
  base: {
    fontSize: '13px',
    color: vars.colors.textMuted,
    fontWeight: 400,
  },
});

const OlderUpdatesSeparator = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '24px 0 16px',
    color: vars.colors.textMuted,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 600,
    width: '100%',
    position: 'relative',

    '&::before': {
      content: '""',
      position: 'absolute',
      left: 0,
      right: 0,
      top: '50%',
      borderTop: `1px solid ${vars.colors.border}`,
      zIndex: 1,
    },
  },
});

const OlderUpdatesText = styled('span', {
  base: {
    background: vars.colors.surface,
    padding: '0 8px',
    zIndex: 2,
  },
});

interface ChangelogModalProps {
  onClose: () => void;
}

export const ChangelogModal: Component<ChangelogModalProps> = (props) => {
  const parsed = parseChangelog(CHANGELOG_CONTENT);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      props.onClose();
    }
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <Portal>
      <ModalBackdrop
        class={themeClass}
        onClick={(e: MouseEvent & { target: HTMLElement; currentTarget: HTMLElement }) =>
          e.target === e.currentTarget && props.onClose()
        }
      >
        <ModalContent onClick={(e: MouseEvent) => e.stopPropagation()}>
          <ModalHeader>
            <ModalTitle>What's New in pdfboop</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <ChangelogHtmlContainer>
              <Show when={parsed.headerHtml}>
                <div innerHTML={parsed.headerHtml} style={{ 'margin-bottom': '24px' }} />
              </Show>
              <For each={parsed.versions}>
                {(ver) => {
                  const showSeparator = () => {
                    const b = bookmarkVersion();
                    if (b === null || b === 0 || b === CURRENT_VERSION) return false;
                    if (ver.version > b) return false;
                    const firstOlder = parsed.versions.find((v) => v.version <= b);
                    return firstOlder?.version === ver.version;
                  };

                  return (
                    <>
                      <Show when={showSeparator()}>
                        <OlderUpdatesSeparator>
                          <OlderUpdatesText>Older updates</OlderUpdatesText>
                        </OlderUpdatesSeparator>
                      </Show>
                      <VersionBlock>
                        <VersionHeader>
                          <span>{ver.title}</span>
                          <Show when={ver.date}>
                            <VersionDate>{ver.date}</VersionDate>
                          </Show>
                        </VersionHeader>
                        <div innerHTML={ver.html} />
                      </VersionBlock>
                    </>
                  );
                }}
              </For>
            </ChangelogHtmlContainer>
          </ModalBody>
          <ModalFooter>
            <Button variant="primary" onClick={props.onClose}>
              Got it!
            </Button>
          </ModalFooter>
        </ModalContent>
      </ModalBackdrop>
    </Portal>
  );
};
