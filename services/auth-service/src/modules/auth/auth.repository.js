/**
 * AuthRepository interface
 * Implementations must return PLAIN objects (never Mongoose docs).
 */
export class AuthRepository {
  /**
   * @param {string} email
   * @returns {Promise<{id: string, name: string, email: string, passwordHash?: string, role: string, createdAt: Date} | null>}
   */
  async findByEmail(email) {
    throw new Error('Not implemented')
  }

  /**
   * @param {{ name: string, email: string, passwordHash: string, role?: string }} data
   * @returns {Promise<{id: string, name: string, email: string, role: string, createdAt: Date}>}
   * @throws {EmailAlreadyExistsError}
   */
  async create(data) {
    throw new Error('Not implemented')
  }

  /**
   * @param {string} id
   * @returns {Promise<{id: string, name: string, email: string, role: string} | null>}
   */
  async findById(id) {
    throw new Error('Not implemented')
  }

  /**
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async updateLastLogin(userId) {
    throw new Error('Not implemented')
  }
}