const sequelize = require ('src/models/connections/connection.js')
const {DataTypes} = require ('sequelize');

const User = sequelize.define(
    'User',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        cpf: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        iescolarId: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM('ALUNO', 'PROFESSOR', 'SECRETÁRIO', 'ADMINISTRADOR', 'RESPONSÁVEL'),
            allowNull: false,
        },
        telephone: {
            type: DataTypes.STRING,
            allowNull: false,
        },
    },
);

User.associate = (models) => {
    User.belongsTo(models.School, { foreignKey: 'iescolarId' });
    User.hasMany(models.Call);
};

module.exports = User;