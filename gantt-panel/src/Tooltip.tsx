import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import Tippy from '@tippyjs/react';
import React, { useState, useCallback, useRef } from 'react';

interface Props {
  content: React.ReactNode;
  children?: React.ReactElement<any>;
}

export const Tooltip = ({ content, children }: Props) => {
  const styles = useStyles2(getStyles);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const tooltipRef = useRef<any>(null);

  const handleClickOutside = useCallback(() => {
    const selection = window.getSelection();
    const isTextSelected = selection && selection.toString().length > 0;
    if (!isTextSelected) {
      setVisible(false);
    }
  }, []);

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setPosition({ x: event.clientX, y: event.clientY });
    setVisible(true);
  };

  return (
    <Tippy
      content={content}
      visible={visible}
      interactive={true}
      maxWidth={500}
      animation={false}
      className={styles.tooltip}
      interactiveBorder={20}
      appendTo={document.body}
      onClickOutside={handleClickOutside}
      trigger="manual"
      ref={tooltipRef}
      getReferenceClientRect={
        position
          ? () => ({
              width: 0,
              height: 0,
              top: position.y,
              bottom: position.y,
              left: position.x,
              right: position.x,
              x: position.x,
              y: position.y,
              toJSON: () => {},
            })
          : undefined
      }
      popperOptions={{
        strategy: 'fixed',
      }}
    >
      {React.cloneElement(children!, {
        onClick: handleClick,
      })}
    </Tippy>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  tooltip: css`
    border-radius: ${theme.v1.border.radius.md};
    background-color: ${theme.v1.colors.bg2};
    padding: ${theme.v1.spacing.sm};
    box-shadow: 0px 0px 20px ${theme.v1.colors.dropdownShadow};
    user-select: text;
  `,
});
