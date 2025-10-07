import React, { useRef, useState, useEffect } from 'react';
import LogViewer from './components/logViewer';
import TestCaseMenu from './components/testMenu';
import SocLog from './components/socLog';
import UcLog from './components/ucLog';
import './App.css';

type TestCase = {
  test_name?: string;
  status: string;
  absolute_line_number?: number;
  absolute_end_line_number?: number;
  has_subtests?: boolean;
  test_item: string;
  start_time?: string;
  end_time?: string;
};

function App() {
  const [logContent, setLogContent] = useState<string>('');

  // Refs for panes
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const middlePaneRef = useRef<HTMLDivElement>(null);
  const part1Ref = useRef<HTMLDivElement>(null);
  const part2Ref = useRef<HTMLDivElement>(null);

  // Heights for vertical split
  const [part1Height, setPart1Height] = useState(window.innerHeight * 0.5);
  const [part2Height, setPart2Height] = useState(window.innerHeight * 0.5);

  // Highlight and selection state
  const [highlightedBegLine, setHighlightedBegLine] = useState<number | null>(null);
  const [highlightedEndLine, setHighlightedEndLine] = useState<number | null>(null);
  const [highlightStatus, setHighlightStatus] = useState<string | null>(null);

  const [selectedTest, setSelectedTest] = useState<{
    name: string;
    status: string;
    lineNumber: number;
    endLineNumber?: number;
    startTime?: string;
    endTime?: string;
  } | null>(null);

  // All and failed tests
  const [allTests, setAllTests] = useState<TestCase[]>([]);
  const [failedTests, setFailedTests] = useState<TestCase[]>([]);

  const [selectedFileName, setSelectedFileName] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sku = params.get('sku');
    const ts = params.get('ts');
    const date = params.get('date');
    const name = params.get('name');

    if (sku && ts && date && name) {
      fetch(`http://127.0.0.1:3000/api/log-matcher?sku=${encodeURIComponent(sku)}&ts=${encodeURIComponent(ts)}&date=${encodeURIComponent(date)}&name=${encodeURIComponent(name)}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error('Failed to fetch file path');
          }
          return res.json();
        })
        .then((data) => {
          if (data.filePath) {
            setSelectedFileName(data.filePath);
          }
        })
        .catch((err) => {
          console.error('Error fetching file path:', err);
        });
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();

        if (!selectedFileName) {
          alert('No file selected for download.');
          return;
        }

        // Create and click a link to download using native browser behavior
        const link = document.createElement('a');
        link.href = `http://127.0.0.1:3000/api/files/?filepath=${encodeURIComponent(selectedFileName)}`;
        link.download = selectedFileName.split('/').pop() ?? 'download.cap';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFileName]);

  useEffect(() => {
    if (!selectedFileName) return; // Skip fetch if no file name
    fetch(`http://127.0.0.1:3000/api/parsed-test-log/?filepath=${selectedFileName}`)
      .then(res => res.json())
      .then((data: TestCase[]) => {
        setAllTests(data);
        setFailedTests(data.filter(tc =>
          tc.status.toLowerCase().includes('fail') && !tc.has_subtests));
      })
      .catch(err => console.error('Failed to fetch test cases:', err));
  }, [selectedFileName]);

  // Fetch test cases once on mount
  useEffect(() => {
    if (!selectedFileName) return;

    const fetchLog = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:3000/api/logs/?filename=${encodeURIComponent(selectedFileName.trim())}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        setLogContent(text);
      } catch (err) {
        console.error('Failed to load log content:', err);
        setLogContent('Failed to load log content.');
      }
    };

    fetchLog();
  }, [selectedFileName]);

  useEffect(() => {
    if (!selectedTest || failedTests.length === 0) {
      return;
    }

    // Find current test's index in allTests
    const currentIndex = allTests.findIndex(test => {
      const testName = test.test_name ?? test.test_item ?? '';
      return testName === selectedTest.name;
    });

    if (currentIndex === -1) {
      return;
    }

    // Search forward in allTests from currentIndex + 1 for next fail test
    let nextFailIndexInAll = -1;
    for (let i = currentIndex + 1; i < allTests.length; i++) {
      const test = allTests[i];
      if (
        test.status.toLowerCase().includes('fail') &&
        !test.has_subtests
      ) {
        nextFailIndexInAll = i;
        break;
      }
    }

    // If no next fail found forward, wrap around and pick the first fail
    if (nextFailIndexInAll === -1) {
      nextFailIndexInAll = allTests.findIndex(test =>
        test.status.toLowerCase().includes('fail') && !test.has_subtests
      );
    }

    if (nextFailIndexInAll === -1) {
      return;
    }

  }, [selectedTest, failedTests, allTests]);

  // Scroll & highlight a line in log viewer
  const scrollToLine = (
    begLine: number | undefined,
    status: string,
    testName: string,
    endLine?: number,
    startTime?: string,
    endTime?: string
  ) => {
    if (begLine === undefined) return;

    setHighlightedBegLine(begLine);
    setHighlightedEndLine(endLine ?? null);
    setHighlightStatus(status);

    setSelectedTest({
      name: testName,
      status,
      lineNumber: begLine,
      endLineNumber: endLine,
      startTime,
      endTime
    });

    // Scroll log line into view
    const element = document.getElementById(`log-line-${begLine}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const isFailHighlightable = (test: TestCase) => {
    const isFailed = test.status.toLowerCase().includes('fail');
    const hasSubtests = !!test.has_subtests;
    const isSubtest = !!test.test_name;

    return isFailed && ((!hasSubtests && !isSubtest) || isSubtest);
  };

  const goToFail = (direction: 'next' | 'prev') => {
    if (allTests.length === 0 || failedTests.length === 0) return;

    const currentLine = selectedTest?.lineNumber;
    const currentIndex = allTests.findIndex(test => test.absolute_line_number === currentLine);

    let targetIndex = -1;

    if (direction === 'next') {
      for (let i = currentIndex + 1; i < allTests.length; i++) {
        if (isFailHighlightable(allTests[i])) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex === -1) {
        targetIndex = allTests.findIndex(isFailHighlightable);
      }
    } else {
      for (let i = currentIndex - 1; i >= 0; i--) {
        if (isFailHighlightable(allTests[i])) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex === -1) {
        for (let i = allTests.length - 1; i >= 0; i--) {
          if (isFailHighlightable(allTests[i])) {
            targetIndex = i;
            break;
          }
        }
      }
    }

    if (targetIndex === -1) return;

    const targetTest = allTests[targetIndex];

    scrollToLine(
      targetTest.absolute_line_number!,
      targetTest.status,
      targetTest.test_name ?? targetTest.test_item,
      targetTest.absolute_end_line_number,
      targetTest.start_time,
      targetTest.end_time
    );
  };

  // Horizontal resizing handler factory
  const handleResize = (target: 'left' | 'middle') => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const leftPane = leftPaneRef.current;
    const middlePane = middlePaneRef.current;

    if (!leftPane || !middlePane) return;

    const leftStart = leftPane.offsetWidth;
    const middleStart = middlePane.offsetWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;

      if (target === 'left') {
        const newLeftWidth = leftStart + deltaX;
        const newMiddleWidth = middleStart - deltaX;

        if (newLeftWidth > 100 && newLeftWidth < window.innerWidth - 300) {
          leftPane.style.flexBasis = `${newLeftWidth}px`;
          middlePane.style.flexBasis = `${newMiddleWidth}px`;
        }
      }

      if (target === 'middle') {
        const newMiddleWidth = middleStart + deltaX;

        if (newMiddleWidth > 150 && newMiddleWidth < window.innerWidth - 150) {
          middlePane.style.flexBasis = `${newMiddleWidth}px`;
        }
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Vertical resizing handler factory
  const handleVerticalResize = (target: 'part1') => (e: React.MouseEvent) => {
    e.preventDefault();

    const startY = e.clientY;
    const initPart1Height = part1Height;
    const initPart2Height = part2Height;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;

      const newPart1 = initPart1Height + deltaY;
      const newPart2 = initPart2Height - deltaY;

      if (newPart1 >= 50 && newPart2 >= 50) {
        setPart1Height(newPart1);
        setPart2Height(newPart2);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Get selected test from allTests to pass to SocLog & UcLog
  const selectedTestObj = allTests.find(t =>
    (t.test_name ?? t.test_item ?? '') === (selectedTest?.name ?? '') &&
    (t.absolute_line_number) === (selectedTest?.lineNumber)
  );

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 40px)',
        width: '100%',
        overflow: 'hidden',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
    >
      {/* Test Menu Pane */}
      <div
        ref={leftPaneRef}
        style={{
          flex: '0 0 15vw', // fixed 15vw width
          minWidth: 150,
          borderRight: '2px solid black',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        <TestCaseMenu
          onTestClick={(line, status, name, endLine, startTime, endTime) =>
            scrollToLine(line, status, name, endLine, startTime, endTime)
          }
          selectedTest={
            selectedTest
              ? { testName: selectedTest.name, lineNumber: selectedTest.lineNumber }
              : null
          }
          onPrevFail={() => goToFail('prev')}
          onNextFail={() => goToFail('next')}
          fileName={selectedFileName}
        />
      </div>

      {/* Resizer between Test Menu and Log Viewer */}
      <div
        style={{
          flex: '0 0 5px',
          cursor: 'col-resize',
          backgroundColor: '#888',
          zIndex: 10,
          boxSizing: 'border-box',
        }}
        onMouseDown={handleResize('left')}
      />

      {/* Log Viewer Pane */}
      <div
        ref={middlePaneRef}
        style={{
          flex: '0 1 55vw',  // allow to grow but not force it
          minWidth: 150,
          borderRight: '2px solid black',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          overflow: 'hidden', // no scroll here
        }}
      >
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <LogViewer
            logContent={logContent}
            highlightedBegLineNumber={highlightedBegLine ?? undefined}
            highlightedEndLineNumber={highlightedEndLine ?? undefined}
            highlightStatus={highlightStatus ?? undefined}
            ref={null}
          />
        </div>
      </div>

      {/* Resizer between Log Viewer and Side Panel */}
      <div
        style={{
          flex: '0 0 5px',
          cursor: 'col-resize',
          backgroundColor: '#888',
          zIndex: 10,
          boxSizing: 'border-box',
        }}
        onMouseDown={handleResize('middle')}
      />

      {/* Side Panel */}
      <div
        style={{
          flex: '1 1 30vw', // flexible but minimum 30vw width
          minWidth: 150,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
          minHeight: 0,
        }}
      >
        {/* SocLog Pane */}
        <div
          ref={part1Ref}
          style={{
            flexBasis: `${part1Height}px`,
            flexShrink: 0,
            flexGrow: 0,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <SocLog
              logContent={logContent}
              testStartTime={selectedTestObj?.start_time}
              testEndTime={selectedTestObj?.end_time}
            />
          </div>
        </div>
        {/* Vertical Resizer */}
        <div
          style={{
            height: '5px',
            cursor: 'row-resize',
            backgroundColor: '#ccc',
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
          onMouseDown={handleVerticalResize('part1')}
        />

        {/* UcLog Pane */}
        <div
          ref={part2Ref}
          style={{
            flex: '1 1 auto',
            overflow: 'auto',
            minHeight: 0,
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          <UcLog
            logContent={logContent}
            testStartTime={selectedTestObj?.start_time}
            testEndTime={selectedTestObj?.end_time}
          />
        </div>
      </div>
    </div>
  );

}

export default App;
