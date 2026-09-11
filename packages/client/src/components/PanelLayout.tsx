import React, { ReactNode } from 'react';
import { Box, IconButton } from '@mui/material';
import { ArrowUpward, ArrowDownward } from '@mui/icons-material';

interface PanelLayoutProps {
  header?: ReactNode;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  footer?: ReactNode;
}

const PanelLayout: React.FC<PanelLayoutProps> = ({ header, leftPanel, rightPanel, footer }) => {
  const rightPanelRef = React.useRef<HTMLDivElement>(null);

  const scrollToTop = () => {
    rightPanelRef.current?.scrollBy({ top: -60, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    rightPanelRef.current?.scrollBy({ top: 60, behavior: 'smooth' });
  };

  return (
    <Box
      sx={{
        width: 480,
        height: 320,
        display: 'grid',
        gridTemplateColumns: '200px 1fr 30px',
        gridTemplateRows: '30px 1fr 22px',
        bgcolor: 'background.default',
        color: 'text.primary',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          gridColumn: '1/-1',
          gridRow: '1',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 1,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {header}
      </Box>

      {/* Left Panel */}
      <Box
        sx={{
          gridColumn: '1',
          gridRow: '2',
          bgcolor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
          p: 0.75,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          overflow: 'hidden',
        }}
      >
        {leftPanel}
      </Box>

      {/* Right Panel */}
      <Box
        sx={{
          gridColumn: '2',
          gridRow: '2',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          ref={rightPanelRef}
          sx={{
            width: '100%',
            height: '100%',
            overflowY: 'auto',
            p: 0.75,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {rightPanel}
        </Box>
      </Box>

      {/* Scroll Bar */}
      <Box
        sx={{
          gridColumn: '3',
          gridRow: '2',
          bgcolor: 'background.paper',
          borderLeft: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 0.75,
        }}
      >
        <IconButton
          size="small"
          onClick={scrollToTop}
          sx={{
            width: 24,
            height: 40,
          }}
        >
          <ArrowUpward fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          onClick={scrollToBottom}
          sx={{
            width: 24,
            height: 40,
          }}
        >
          <ArrowDownward fontSize="small" />
        </IconButton>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          gridColumn: '1/-1',
          gridRow: '3',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 1,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          fontSize: '10px',
          color: 'text.secondary',
        }}
      >
        {footer}
      </Box>
    </Box>
  );
};

export default PanelLayout;
