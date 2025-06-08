import '../../components/ask-ai-button';

import { html } from 'lit';

const AICodeItemGroups = buildAICodeItemGroups();
const buttonOptions: AskAIButtonOptions = {
  size: 'small',
  panelWidth: 240,
};

import type { AffineCodeToolbarWidget } from '@blocksuite/affine/blocks/code';
import { BlockSelection } from '@blocksuite/affine/std';
import type { MenuItemGroup } from '@blocksuite/affine-components/toolbar';

import { buildAICodeItemGroups } from '../../_common/config';
import type { AskAIButtonOptions } from '../../components/ask-ai-button';

export function setupCodeToolbarAIEntry(codeToolbar: AffineCodeToolbarWidget) {
  // Avoid injecting duplicate Ask AI buttons when the toolbar is re-created,
  // such as after moving code blocks.
  const groups = (
    codeToolbar as unknown as {
      primaryGroups: MenuItemGroup<any>[];
    }
  ).primaryGroups;
  const exists = groups?.some(group =>
    group.items.some(item => item.type === 'ask-ai')
  );

  if (exists) {
    return;
  }

  codeToolbar.addPrimaryItems(
    [
      {
        type: 'ask-ai',
        when: ({ doc }) => !doc.readonly,
        generate: ({ host, blockComponent }) => {
          return {
            action: () => {
              const { selection } = host;
              selection.setGroup('note', [
                selection.create(BlockSelection, {
                  blockId: blockComponent.blockId,
                }),
              ]);
            },
            render: item =>
              html`<ask-ai-button
                class="code-toolbar-button ask-ai"
                .host=${host}
                .actionGroups=${AICodeItemGroups}
                .toggleType=${'click'}
                .options=${buttonOptions}
                @click=${(e: MouseEvent) => {
                  e.stopPropagation();
                  item.action();
                }}
              ></ask-ai-button>`,
          };
        },
      },
    ],
    2
  );
}
