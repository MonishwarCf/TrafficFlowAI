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
      <Handle type="target" position={Position.Left} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#555' }} />
      FINISH
    </div>
  );
}
