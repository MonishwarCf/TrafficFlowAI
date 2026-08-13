import { Handle, Position } from 'reactflow';

export default function CustomJunctionNode({ data }: { data: any }) {
  const lightColor = data.light === 'Green' ? '#4caf50' : '#f44336';

  return (
    <div style={{
      width: '100px', height: '100px',
      backgroundColor: '#333',
      position: 'relative',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid #555'
    }}>
      <Handle type="target" position={Position.Top} id="t" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="b" style={{ left: '50%' }} />
      <Handle type="target" position={Position.Left} id="l" style={{ top: '50%' }} />
      <Handle type="source" position={Position.Right} id="r" style={{ top: '50%' }} />
      
      {/* Crosswalks */}
      <div style={{ position: 'absolute', top: 5, left: 10, right: 10, height: 10, background: 'repeating-linear-gradient(90deg, transparent, transparent 5px, white 5px, white 10px)' }} />
      <div style={{ position: 'absolute', bottom: 5, left: 10, right: 10, height: 10, background: 'repeating-linear-gradient(90deg, transparent, transparent 5px, white 5px, white 10px)' }} />
      <div style={{ position: 'absolute', left: 5, top: 10, bottom: 10, width: 10, background: 'repeating-linear-gradient(0deg, transparent, transparent 5px, white 5px, white 10px)' }} />
      <div style={{ position: 'absolute', right: 5, top: 10, bottom: 10, width: 10, background: 'repeating-linear-gradient(0deg, transparent, transparent 5px, white 5px, white 10px)' }} />

      {/* Traffic Light */}
      <div style={{
        width: 20, height: 20,
        borderRadius: '50%',
        backgroundColor: lightColor,
        boxShadow: `0 0 10px ${lightColor}`,
        zIndex: 10
      }} />
      <div style={{ position: 'absolute', top: '-25px', color: 'white', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
        {data.label}
      </div>
    </div>
  );
}
