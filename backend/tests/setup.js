// Las pruebas de rutas no tienen base de datos: `requireAuth` pregunta en cada petición si
// la cuenta sigue activa, así que aquí se da por activa (como tatuador). Las pruebas de
// administración cambian el rol con `accountStatus.check.mockResolvedValue(...)`, y la de
// `accountStatus` usa el módulo real con `jest.unmock`.
jest.mock('../src/services/accountStatus', () => {
  const actual = jest.requireActual('../src/services/accountStatus');
  return {
    ...actual,
    check: jest.fn().mockResolvedValue({ ok: true, role: 'tatuador' }),
    invalidate: jest.fn(),
  };
});

beforeEach(() => {
  // clearAllMocks/resetAllMocks de cada prueba no deben dejar el chequeo sin respuesta.
  // La prueba que usa el módulo real (jest.unmock) no tiene mock que reiniciar.
  const { check } = require('../src/services/accountStatus');
  if (jest.isMockFunction(check)) check.mockResolvedValue({ ok: true, role: 'tatuador' });
});
