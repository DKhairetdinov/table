  import { useCallback, useRef, useState, memo } from "react";
  import type { Cell, GridCellProps } from "./types";

  const getColumnLabel = (index: number): string => {
    let label = "";
    let i = index;
    while (i >= 0) {
      label = String.fromCharCode((i % 26) + 65) + label;
      i = Math.floor(i / 26) - 1;
    }
    return label;
  };

  const expandRange = (range: string) => {
    const [start, end] = range.split(':');
    const startCol = start[0].charCodeAt(0);
    const startRow = parseInt(start.slice(1));
    const endCol = end[0].charCodeAt(0);
    const endRow = parseInt(end.slice(1));
    const result = [];
    for(let c = startCol; c <= endCol; c++) {
      for(let r = startRow; r <= endRow; r++) {
        result.push(`${String.fromCharCode(c)}${r}`);
      }
    }
    return result.join(', ');
  };

  const evaluateFormula = (rawValue: string, allCells: Record<string, Cell>, currentAddress: string): string | number => {
    if(!rawValue.startsWith('=') ) return rawValue;
    try {
      const formula = rawValue.slice(1).trim();
      const formulaWithExpandedRanges = formula.replace(/([A-Z][0-9]+):([A-Z][0-9]+)/gi, (match) => expandRange(match));
      const processedFormula = formulaWithExpandedRanges.replace(/([A-Z][0-9]+)/gi, (match) => {
        if(match.toUpperCase() === currentAddress.toUpperCase()) return '0';
        const val = allCells[match.toUpperCase()]?.computedData;
        return val && !isNaN(Number(val)) ? val.toString() : '0';
      });
      const helperFunction = `
        const SUM = (...args) => args.flat().reduce((a, b) => a + Number(b || 0), 0);
        const AVERAGE = (...args) => args.flat().length ? SUM(...args) / args.flat().length : 0;
      `;
      return new Function(`${helperFunction} return ${processedFormula}`)();
    } catch (error) {
      return '#ERROR!';
    }
  };

  const GridCell = memo(({ 
    address, rawValue, computedData, isActive, isEditing, 
    onSelect, onDoubleClick, onFinishEdit, onUpdate, style
  }: GridCellProps) => {
    return (
      <td
        id={address}
        tabIndex={0}
        onClick={() => onSelect(address)}
        onDoubleClick={() => onDoubleClick(address)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isEditing) onDoubleClick(address);
        }}
        style={{
          ...style,
          border: '1px solid #ccc',
          textAlign: 'center',
          backgroundColor: isActive ? '#e8f0fe' : 'white',
          outline: isActive ? '1px solid #1a73e8' : 'none',
          zIndex: isActive ? 1 : 0,
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        {isEditing ? (
          <input
            autoFocus
            value={rawValue}
            onChange={(e) => onUpdate(address, e.target.value)}
            onBlur={(e) => onFinishEdit(address, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onFinishEdit(address, e.currentTarget.value); }}
            style={{ width: '100%', height: '100%', border: 'none', outline: 'none', textAlign: 'center' }}
          />
        ) : (
          computedData || ''
        )}
      </td>
    );
  });

  export function Table() {
    const [cells, setCells] = useState<Record<string, Cell>>({});
    const [activeCell, setActiveCell] = useState<string | null>(null);
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [colCount, setColCount] = useState(26);
    const [rowCount, setRowCount] = useState(100);
    const [colWidths, setColWidths] = useState<Record<number, number>>({});
    const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
    const [scrollTop, setScrollTop] = useState(0);
    const DEFAULT_WIDTHS = 100;
    const DEFAULT_HEIGHT = 28;
    const VIEWPORT_HEIGHT = 845;
    const OVERSCAN = 5;

    const getTotalHeight = () => {
      let total = 0;
      for (let i = 0; i < rowCount; i++) {
        total += rowHeights[i] || DEFAULT_HEIGHT;
      }
      return total;
    };

    const startIndex = Math.max(0, Math.floor(scrollTop / DEFAULT_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(rowCount - 1, Math.floor((scrollTop + 800) / DEFAULT_HEIGHT) + OVERSCAN);
    const offsetY = startIndex * DEFAULT_HEIGHT;

    const handleResizeMouseDown = useCallback((index: number, e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.pageX;
      const startWith = colWidths[index] || DEFAULT_WIDTHS;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = Math.max(50, startWith + (moveEvent.pageX - startX));
        setColWidths(prev => ({ ...prev, [index]: newWidth }));
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }, [colWidths])

    const handleRowResizeMouseDown = useCallback((index: number, e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.pageY;
      const startHeight = rowHeights[index] || DEFAULT_HEIGHT;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const newHeight = Math.max(20, startHeight + (moveEvent.pageY - startY));
        setRowHeights(prev => ({ ...prev, [index]: newHeight }));
      }

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      } 

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }, [rowHeights]);

    const rowCountRef = useRef(rowCount);
    rowCountRef.current = rowCount;

    const handleSelect = useCallback((address: string) => setActiveCell(address), []);
    const handleDoubleClick = useCallback((address: string) => setEditingCell(address), []);
    const handleUpdate = useCallback((address: string, value: string) => {
      setCells((prev) => ({
        ...prev,
        [address]: { ...prev[address], rawValue: value, computedData: value }
      }));
    }, []);

    const onFinishEdit = useCallback((address: string, value: string) => {
      setCells((prev) => {
        const initialResult = evaluateFormula(value, prev, address);
        const newCells = { ...prev, [address]: { ...prev[address], rawValue: value, computedData: initialResult } };
        Object.keys(newCells).forEach(key => {
          if(newCells[key].rawValue.startsWith('=') && key !== address) {
            newCells[key].computedData = evaluateFormula(newCells[key].rawValue, newCells, key);
          }
        });
        return newCells;
      });
      setEditingCell(null);
      const col = address.match(/[A-Z]+/)?.[0];
      const row = parseInt(address.match(/[0-9]+/)?.[0] || '0');
      if(col && row < rowCountRef.current) {
        const nextAddress = `${col}${row + 1}`;
        setActiveCell(nextAddress);
        setTimeout(() => document.getElementById(nextAddress)?.focus(), 0);
      }
    }, []);

    const [menu, setMenu] = useState<{x: number, y: number, visible: boolean, targetIndex: number, type: 'row' | 'col' | null}>({
      x: 0, y: 0, visible: false, targetIndex: -1, type: null
    });

    const shiftRows = (targetRowNumber: number, amount: number) => {
      setCells(prevCells => {
        const newCells: Record<string, Cell> = {};
        Object.keys(prevCells).forEach(address => {
          const col = address.match(/[A-Z]+/)?.[0] || '';
          const row = parseInt(address.match(/[0-9]+/)?.[0] || '0');
          if (amount > 0) {
            if (row > targetRowNumber) newCells[`${col}${row + amount}`] = prevCells[address];
            else newCells[address] = prevCells[address];
          } else {
            if (row === targetRowNumber + 1) return; 
            if (row > targetRowNumber + 1) newCells[`${col}${row + amount}`] = prevCells[address];
            else newCells[address] = prevCells[address];
          }
        });
        return newCells;
      });
    };

    const shiftCols = (targetColIdx: number, amount: number) => {
      setCells(prevCells => {
        const newCells: Record<string, Cell> = {};
        Object.keys(prevCells).forEach(address => {
          const colStr = address.match(/[A-Z]+/)?.[0] || '';
          const row = address.match(/[0-9]+/)?.[0] || '';
          let colIdx = 0;
          for (let i = 0; i < colStr.length; i++) {
            colIdx = colIdx * 26 + colStr.charCodeAt(i) - 64;
          }
          colIdx -= 1;
          if (amount > 0) {
            if (colIdx > targetColIdx) newCells[`${getColumnLabel(colIdx + amount)}${row}`] = prevCells[address];
            else newCells[address] = prevCells[address];
          } else {
            if (colIdx === targetColIdx) return;
            if (colIdx > targetColIdx) newCells[`${getColumnLabel(colIdx + amount)}${row}`] = prevCells[address];
            else newCells[address] = prevCells[address];
          }
        });
        return newCells;
      });
    };

    const addRow = (index: number) => { setRowCount(p => p + 1); shiftRows(index + 1, 1); setMenu(p => ({ ...p, visible: false })); };
    const deleteRow = (index: number) => { if (rowCount <= 1) return; setRowCount(p => p - 1); shiftRows(index, -1); setMenu(p => ({ ...p, visible: false })); };
    const addCol = (index: number) => { setColCount(p => p + 1); shiftCols(index, 1); setMenu(p => ({ ...p, visible: false })); };
    const deleteCol = (index: number) => { if (colCount <= 1) return; setColCount(p => p - 1); shiftCols(index, -1); setMenu(p => ({ ...p, visible: false })); };

    return(
      <>
        <div style={{padding: '10px', background: '#eeeeee', display: 'flex', gap: '10px' }} onClick={() => setMenu(p => ({...p, visible: false}))}>
          <div style={{ fontWeight: 'bold', width: '60px', color: '#232323' }}>{activeCell || ''}</div>
          <input 
            style={{ flex: 1 }}
            disabled={!activeCell}
            value={activeCell ? (cells[activeCell]?.rawValue || '') : ''}
            onChange={(e) => activeCell && handleUpdate(activeCell, e.target.value)}
            onBlur={(e) => activeCell && onFinishEdit(activeCell, e.target.value)}
          />
        </div>

        <div
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          style={{ height: `${VIEWPORT_HEIGHT}px`, overflow: 'auto', position: 'relative', border: '1px solid #ccc' }}
        >
        <div style={{ height: `${getTotalHeight()}px`, position: 'absolute', width: '100%', top: 0, left: 0 }}/>

        <table style={{borderCollapse: 'collapse', tableLayout: 'fixed', position: 'relative', transform: `translateY(${offsetY}px)`, zIndex: 2, backgroundColor: 'white' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 11, background: '#f5f5f5', transform: `translateY(${-offsetY}px)` }}>
            <tr>
              <th style={{minWidth: '50px', border: '1px solid #ccc', height: '25px', background: '#f5f5f5'}}></th>
              {Array.from({ length: colCount }).map((_, index) => {
                const width = colWidths[index] || DEFAULT_WIDTHS;
                return(              
                <th key={index} 
                  style={{ width: `${width}px`, minWidth: `${width}px`, border: '1px solid #ccc', background: '#f5f5f5', position: 'relative', padding: 0 }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, visible: true, targetIndex: index, type: 'col' });
                  }}
                > 
                <div style={{ padding: '4px' }}>{getColumnLabel(index)}</div>
                <div
                  onMouseDown={(e) => handleResizeMouseDown(index, e)}
                  style={{ position: 'absolute', right: 0, top: 0, width: '5px', height: '100%', cursor: 'col-resize', zIndex: 10}}
                />
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).slice(startIndex, endIndex + 1).map((_, i) => {
              const rowIndex = startIndex + i;
              const height = rowHeights[rowIndex] || DEFAULT_HEIGHT;
              return (
                <tr key={rowIndex} style={{ height: `${height}px`}}>
                <th style={{ border: '1px solid #ccc', background: '#f5f5f5', height: `${height}px`, position: 'relative', padding: 0, width: '50px' }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, visible: true, targetIndex: rowIndex, type: 'row' });
                  }}
                >
                  {rowIndex + 1} 
                  <div 
                  onMouseDown={(e) => handleRowResizeMouseDown(rowIndex, e)}
                  style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: '5px', cursor: 'row-resize', zIndex: 10 }}
                />
                </th>

                {Array.from({ length: colCount }).map((_, colIndex) => {
                  const address = `${getColumnLabel(colIndex)}${rowIndex + 1}`;
                  const cellData = cells[address] || { rawValue: '', computedData: ''};
                  const width = colWidths[colIndex] || DEFAULT_WIDTHS;
                  const height = rowHeights[rowIndex] || DEFAULT_HEIGHT;
                  return (
                    <GridCell
                      key={address}
                      address={address}
                      rawValue={cellData.rawValue}
                      computedData={cellData.computedData}
                      isActive={activeCell === address}
                      isEditing={editingCell === address}
                      onSelect={handleSelect}
                      onDoubleClick={handleDoubleClick}
                      onFinishEdit={onFinishEdit}
                      onUpdate={handleUpdate}
                      style={{ width: `${width}px`, minWidth: `${width}px`, height: `${height}px`}}
                    />
                  );
                })}
                </tr>
                );
              })}
          </tbody>
        </table>
        </div>
        
        {menu.visible && (
          <ul style={{ position: 'fixed', top: menu.y, left: menu.x, backgroundColor: 'white', border: '1px solid #ccc', padding: '5px 0', listStyle: 'none', zIndex: 1000, minWidth: '150px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
            <li style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={() => menu.type === 'row' ? addRow(menu.targetIndex) : addCol(menu.targetIndex)}>
              Добавить {menu.type === 'row' ? 'строку' : 'столбец'}
            </li>
            <li style={{ padding: '8px 12px', cursor: 'pointer', color: 'red' }} onClick={() => menu.type === 'row' ? deleteRow(menu.targetIndex) : deleteCol(menu.targetIndex)}>
              Удалить {menu.type === 'row' ? 'строку' : 'столбец'}
            </li>
          </ul>
        )}
      </>
    )
}