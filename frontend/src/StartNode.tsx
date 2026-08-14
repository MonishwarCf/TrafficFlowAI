import { Handle, Position } from 'reactflow';

export default function StartNode({ data }: { data: any }) {
  return (
    <div style={{
      width: 60,
      height: 60,
      background: '#4caf50',
      border: '3px solid #2e7d32',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontWeight: 'bold',
      boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
      position: 'relative'
    }}>
      {data.label || 'START'}
      <Handle type="source" position={Position.Top} id="N_out" style={{ top: -12, background: '#2196f3', width: 24, height: 24, borderRadius: '50%', border: '2px solid #fff' }} />
      <Handle type="source" position={Position.Bottom} id="S_out" style={{ bottom: -12, background: '#2196f3', width: 24, height: 24, borderRadius: '50%', border: '2px solid #fff' }} />
      <Handle type="source" position={Position.Right} id="E_out" style={{ right: -12, background: '#2196f3', width: 24, height: 24, borderRadius: '50%', border: '2px solid #fff' }} />
      <Handle type="source" position={Position.Left} id="W_out" style={{ left: -12, background: '#2196f3', width: 24, height: 24, borderRadius: '50%', border: '2px solid #fff' }} />
    </div>
  );
}
