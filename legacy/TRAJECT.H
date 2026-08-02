
	#ifndef _DATATYPE_H
	#include "datatype.h"
	#endif

	#ifndef	_TRAJECT_H
	#define	_TRAJECT_H
	#endif


	class Trajectory
	{
		protected:
			// 	variables and pointers to variables concerning
			// 	the physical characteristics of a trajectory
				float*		m_pfAcceleration;
				float*		m_pfPosition;
				float*		m_pfSpeed;
				float		m_fTrajectoryTime;
				float		m_fLambda;

				float		m_fInitialPosition;
				float		m_fFinalPosition;
				float		m_fKV;
				float		m_fKA;

				// cursors, to walk over the arrays ...
				UINT		m_uiCurrentPosition;
				UINT		m_uiCurrentSpeed;
				UINT		m_uiCurrentAcceleration;

				UINT		m_uiType;
				UINT		m_uiDirection;

			//	variables which help controlling the quantification
			//	of the trajectory
				UINT		m_uiQuantum;
				UINT		m_uiDivisions;
				UINT		m_uiMaxDivisions;
				UINT		m_uiNrOfValues;


			// 	declaration of methods which computes
			// 	the physical trajectory
				virtual 	BOOL	m_ComputePosition( void );
				virtual		BOOL	m_ComputeSpeed( void );
				virtual		BOOL	m_ComputeAcceleration( void );
				virtual		BOOL	m_ComputeLambda( void );
				virtual		float	m_ComputeTrajectoryTime( void );


				BOOL	m_ComputeDivisions( void );


			// 	some additional, very handy methods...
				BOOL	m_Plot( float*, float, float );
				float	m_GetMaximumOf( float* );




		public:
			// 	and now, here are coming the big ones,
			//	methods	which control everything ( a kind of buttons )...
				float	D( void );
				float	GetTime();
				float	GetScaledTime();
				UINT	GetDirection();
				UINT	GetNrOfDivisions();
				DWORD	GetStepsToExecute();

				float	GetNextPosition();
				float	GetInitPosition();
				float	GetFinalPosition();

				float	GetNextSpeed();
				float	GetInitSpeed();
				float	GetFinalSpeed();

				BOOL	SetTimeTo( float );
				BOOL	SetQuantumTo( UINT );
				BOOL	SetMaxDivisionsTo( UINT );
				BOOL	ComputeTrajectory( void );
				BOOL	Setup( float, float, float, float );
				BOOL	Show( void );
				BOOL	DumpOut( void );


			// 	life and death of a trajectory is controlled by:
				Trajectory(  void ); 				// Default constructor ...
				Trajectory(  Trajectory& );			// Copy    constructor ...
				~Trajectory( void );				// Destructor  ...

	};
