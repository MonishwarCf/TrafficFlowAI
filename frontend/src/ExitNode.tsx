import { Handle, Position } from 'reactflow';

export default function ExitNode() {
  return (
    <div style={{
      width: '100px',
      height: '40px',
      background: 'repeating-linear-gradient(45deg, #000, #000 10px, #ffeb3b 10px, #ffeb3b 20px)',
      border: '2px solid #333',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: 'bold',
      textShadow: '1px 1px 2px #000'
    }}>
      <Handle type="target" position={Position.Left} style={{ width: 24, height: 24, left: -12, borderRadius: '50%', backgroundColor: '#4caf50', border: '2px solid white', zIndex: 20 }} />
      <Handle type="source" position={Position.Right} style={{ width: 24, height: 24, right: -12, borderRadius: '50%', backgroundColor: '#2196F3', border: '2px solid white', zIndex: 20 }} />
      <Handle type="target" position={Position.Top} style={{ width: 24, height: 24, top: -12, borderRadius: '50%', backgroundColor: '#4caf50', border: '2px solid white', zIndex: 20 }} />
      <Handle type="target" position={Position.Bottom} style={{ width: 24, height: 24, bottom: -12, borderRadius: '50%', backgroundColor: '#4caf50', border: '2px solid white', zIndex: 20 }} />
      FINISH
    </div>
  );
}
